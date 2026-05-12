import Redis from "ioredis";
import { env } from "./env";

// ============================================================
// Redis Client (Upstash compatible via TLS URL)
// Falls back to a no-op cache if Redis is unavailable (hackathon dev mode)
// ============================================================

let redisClient: Redis | null = null;

export function getRedis(): Redis {
  if (!redisClient) {
    const url = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

    if (url) {
      redisClient = new Redis(url, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: false,
        tls: url.startsWith("rediss://") ? {} : undefined,
      });

      redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err.message);
      });

      redisClient.on("connect", () => {
        console.log("[Redis] Connected successfully");
      });
    } else {
      console.warn("[Redis] No REDIS_URL configured — using in-memory fallback");
      // Return a mock Redis for local dev without Redis
      return createMemoryRedis() as any;
    }
  }
  return redisClient!;
}

// ============================================================
// In-Memory Redis Fallback for dev/hackathon
// ============================================================

const memStore = new Map<string, { value: string; expireAt?: number }>();

function createMemoryRedis() {
  return {
    get: async (key: string) => {
      const entry = memStore.get(key);
      if (!entry) return null;
      if (entry.expireAt && Date.now() > entry.expireAt) {
        memStore.delete(key);
        return null;
      }
      return entry.value;
    },
    set: async (key: string, value: string, mode?: string, ttl?: number) => {
      const expireAt = ttl ? Date.now() + ttl * 1000 : undefined;
      memStore.set(key, { value, expireAt });
      return "OK";
    },
    setex: async (key: string, ttl: number, value: string) => {
      memStore.set(key, { value, expireAt: Date.now() + ttl * 1000 });
      return "OK";
    },
    del: async (...keys: string[]) => {
      keys.forEach((k) => memStore.delete(k));
      return keys.length;
    },
    incr: async (key: string) => {
      const entry = memStore.get(key);
      const val = parseInt(entry?.value || "0", 10) + 1;
      memStore.set(key, { value: String(val) });
      return val;
    },
    expire: async (key: string, ttl: number) => {
      const entry = memStore.get(key);
      if (entry) memStore.set(key, { ...entry, expireAt: Date.now() + ttl * 1000 });
      return 1;
    },
    exists: async (key: string) => {
      return memStore.has(key) ? 1 : 0;
    },
    lpush: async (key: string, ...values: string[]) => {
      const entry = memStore.get(key);
      const arr = entry ? JSON.parse(entry.value) : [];
      arr.unshift(...values);
      memStore.set(key, { value: JSON.stringify(arr) });
      return arr.length;
    },
    lrange: async (key: string, start: number, stop: number) => {
      const entry = memStore.get(key);
      if (!entry) return [];
      const arr = JSON.parse(entry.value);
      return stop === -1 ? arr.slice(start) : arr.slice(start, stop + 1);
    },
    zadd: async (key: string, score: number, member: string) => {
      // Simplified sorted set
      const entry = memStore.get(key);
      const set: Record<string, number> = entry ? JSON.parse(entry.value) : {};
      set[member] = score;
      memStore.set(key, { value: JSON.stringify(set) });
      return 1;
    },
    zrange: async (key: string, start: number, stop: number, withScores?: string) => {
      const entry = memStore.get(key);
      if (!entry) return [];
      const set: Record<string, number> = JSON.parse(entry.value);
      const sorted = Object.entries(set).sort(([, a], [, b]) => a - b);
      const slice = stop === -1 ? sorted.slice(start) : sorted.slice(start, stop + 1);
      return withScores ? slice.flatMap(([k, v]) => [k, String(v)]) : slice.map(([k]) => k);
    },
    zrevrange: async (key: string, start: number, stop: number) => {
      const entry = memStore.get(key);
      if (!entry) return [];
      const set: Record<string, number> = JSON.parse(entry.value);
      const sorted = Object.entries(set).sort(([, a], [, b]) => b - a);
      return (stop === -1 ? sorted.slice(start) : sorted.slice(start, stop + 1)).map(([k]) => k);
    },
    hset: async (key: string, field: string, value: string) => {
      const entry = memStore.get(key);
      const hash: Record<string, string> = entry ? JSON.parse(entry.value) : {};
      hash[field] = value;
      memStore.set(key, { value: JSON.stringify(hash) });
      return 1;
    },
    hget: async (key: string, field: string) => {
      const entry = memStore.get(key);
      if (!entry) return null;
      const hash: Record<string, string> = JSON.parse(entry.value);
      return hash[field] || null;
    },
    hgetall: async (key: string) => {
      const entry = memStore.get(key);
      if (!entry) return {};
      return JSON.parse(entry.value);
    },
    disconnect: async () => {},
    quit: async () => "OK",
    pipeline: () => ({
      exec: async () => [],
      set: function() { return this; },
      del: function() { return this; },
    }),
  };
}

// ============================================================
// Cache helpers
// ============================================================

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const r = getRedis();
    const val = await r.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
  try {
    const r = getRedis();
    await r.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Non-fatal
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    const r = getRedis();
    await r.del(...keys);
  } catch {
    // Non-fatal
  }
}

export const CACHE_KEYS = {
  leaderboard: (type: string, period?: string) =>
    `leaderboard:${type}:${period || "all"}`,
  agentProfile: (id: string) => `agent:${id}:profile`,
  campaignList: (status: string) => `campaigns:${status}`,
  campaignDetail: (id: string) => `campaign:${id}`,
  agentSkills: (id: string) => `agent:${id}:skills`,
  userStats: (id: string) => `user:${id}:stats`,
  battleQueue: "battle:queue",
  torqueQueue: "torque:event:queue",
  xpLock: (agentId: string) => `lock:xp:${agentId}`,
  battleLock: (agentId: string) => `lock:battle:${agentId}`,
  trainingLock: (agentId: string) => `lock:training:${agentId}`,
  rateLimitAI: (userId: string) => `rl:ai:${userId}`,
  rateLimitBattle: (userId: string) => `rl:battle:${userId}`,
  rateLimitTrain: (userId: string) => `rl:train:${userId}`,
};
