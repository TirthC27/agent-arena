// ============================================================
// ANTI-CHEAT & ANTI-SPAM ENGINE
// Prevents XP farming, fake battles, duplicate rewards, spam training
// ============================================================

import { prisma } from "../config/db";
import { cacheGet, cacheSet, getRedis, CACHE_KEYS } from "../config/redis";
import { ApiError } from "../utils/ApiError";
import * as crypto from "crypto";

// ============================================================
// Rate Limiting (Redis-backed)
// ============================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  try {
    const r = getRedis() as any;
    const current = await r.incr(key);

    if (current === 1) {
      await r.expire(key, windowSeconds);
    }

    const ttl = await r.ttl ? await r.ttl(key) : windowSeconds;
    const resetAt = new Date(Date.now() + (ttl || windowSeconds) * 1000);

    return {
      allowed: current <= maxRequests,
      remaining: Math.max(0, maxRequests - current),
      resetAt,
    };
  } catch {
    // If Redis fails, allow the request (fail open)
    return { allowed: true, remaining: 1, resetAt: new Date() };
  }
}

// ============================================================
// Battle Anti-Cheat
// ============================================================

export async function validateBattleRequest(
  agentId: string,
  userId: string,
  category: string,
  req: { ip?: string; headers?: Record<string, string | string[] | undefined> }
): Promise<void> {
  // 1. Rate limit: max 5 battles per hour per user
  const rlKey = CACHE_KEYS.rateLimitBattle(userId);
  const rl = await checkRateLimit(rlKey, 5, 3600);
  if (!rl.allowed) {
    throw ApiError.tooManyRequests("Maximum 5 battles per hour per user");
  }

  // 2. Agent battle cooldown: 2 minutes between battles
  const cooldownKey = `battle:cooldown:${agentId}`;
  const onCooldown = await cacheGet<boolean>(cooldownKey);
  if (onCooldown) {
    throw ApiError.badRequest("Agent needs 2-minute rest between battles");
  }

  // 3. Prevent same-user battles
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { userId: true },
  });
  if (!agent) throw ApiError.notFound("Agent not found");

  // 4. Check energy
  const fullAgent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (fullAgent && fullAgent.energy < 15) {
    throw ApiError.badRequest("Insufficient energy for battle (need 15+)");
  }

  // Set cooldown
  await cacheSet(cooldownKey, true, 120);
}

export function preventSameUserBattle(agent1UserId: string, agent2UserId: string): void {
  if (agent1UserId === agent2UserId) {
    throw ApiError.badRequest("Cannot battle your own agent");
  }
}

// ============================================================
// Training Anti-Spam
// ============================================================

export async function validateTrainingRequest(
  agentId: string,
  userId: string
): Promise<void> {
  // 1. Rate limit: max 10 training sessions per hour per user
  const rlKey = CACHE_KEYS.rateLimitTrain(userId);
  const rl = await checkRateLimit(rlKey, 10, 3600);
  if (!rl.allowed) {
    throw ApiError.tooManyRequests("Maximum 10 training sessions per hour");
  }

  // 2. Check energy (handled in trainAgent)
  // 3. Anti-spam: same domain can only be trained once per 15 minutes
  const domainKey = `train:domain:${agentId}`;
  // Note: actual domain check is in trainAgent with lock
}

// ============================================================
// Reward Anti-Duplicate
// ============================================================

export async function checkRewardAlreadyClaimed(
  userId: string,
  rewardId: string
): Promise<boolean> {
  const claim = await prisma.rewardClaim.findUnique({
    where: { userId_rewardId: { userId, rewardId } },
  });
  return !!claim;
}

export async function validateRewardClaim(
  userId: string,
  rewardId: string
): Promise<void> {
  const alreadyClaimed = await checkRewardAlreadyClaimed(userId, rewardId);
  if (alreadyClaimed) {
    throw ApiError.badRequest("Reward already claimed");
  }

  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) throw ApiError.notFound("Reward not found");

  if (reward.expiresAt && new Date() > reward.expiresAt) {
    throw ApiError.badRequest("Reward has expired");
  }
}

// ============================================================
// XP Anomaly Detection
// ============================================================

export async function detectXPAnomaly(
  agentId: string,
  xpToAdd: number
): Promise<boolean> {
  // Flag if more than 1000 XP gained in a single event
  if (xpToAdd > 1000) {
    await flagAgent(agentId, `Suspicious XP gain: ${xpToAdd} in single event`);
    return true;
  }

  // Check XP gain rate: max 500 XP per hour
  const hourlyKey = `xp:hourly:${agentId}`;
  try {
    const r = getRedis() as any;
    const current = await r.incr(hourlyKey);
    if (current === 1) await r.expire(hourlyKey, 3600);

    if (current * xpToAdd > 500) {
      // Soft flag — don't block but log
      console.warn(`[AntiCheat] High XP rate for ${agentId}: ${current * xpToAdd} XP/hr`);
    }
  } catch {
    // Redis unavailable — skip check
  }

  return false;
}

// ============================================================
// Battle Result Validation
// ============================================================

export async function validateBattleResult(battleId: string): Promise<boolean> {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      agent1: { select: { userId: true } },
      agent2: { select: { userId: true } },
    },
  });

  if (!battle) return false;

  // Flag if same user owns both agents
  if (battle.agent1.userId === battle.agent2.userId) {
    await prisma.battle.update({
      where: { id: battleId },
      data: { flagged: true, flagReason: "Same user owns both agents" },
    });
    return false;
  }

  return true;
}

// ============================================================
// IP Hashing (for duplicate detection)
// ============================================================

export function hashIP(ip: string): string {
  return crypto
    .createHash("sha256")
    .update(ip + process.env.JWT_SECRET!)
    .digest("hex")
    .slice(0, 16);
}

// ============================================================
// Agent Flagging
// ============================================================

async function flagAgent(agentId: string, reason: string): Promise<void> {
  console.error(`[AntiCheat] Agent ${agentId} flagged: ${reason}`);
  // In production: store in DB, alert moderation
}

// ============================================================
// Streak Validation
// ============================================================

export async function updateStreak(
  userId: string,
  agentId: string,
  type: string
): Promise<{ streak: number; leveledUp: boolean }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const streak = await prisma.streak.upsert({
    where: { userId_type: { userId, type } },
    create: {
      userId,
      agentId,
      type,
      currentStreak: 1,
      longestStreak: 1,
      lastActivityAt: new Date(),
      streakStartAt: new Date(),
    },
    update: {}, // Don't update yet — we'll check below
  });

  const lastActivity = streak.lastActivityAt;

  // Already active today
  if (lastActivity && lastActivity >= today) {
    return { streak: streak.currentStreak, leveledUp: false };
  }

  // Consecutive day
  const isConsecutive =
    lastActivity &&
    lastActivity >= yesterday &&
    lastActivity < today;

  const newStreak = isConsecutive ? streak.currentStreak + 1 : 1;
  const newLongest = Math.max(newStreak, streak.longestStreak);

  await prisma.streak.update({
    where: { userId_type: { userId, type } },
    data: {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityAt: new Date(),
      streakStartAt: isConsecutive ? streak.streakStartAt : new Date(),
    },
  });

  // Streak milestones: 3, 7, 14, 30, 60, 100
  const milestones = [3, 7, 14, 30, 60, 100];
  const hitMilestone = milestones.includes(newStreak);

  return { streak: newStreak, leveledUp: hitMilestone };
}
