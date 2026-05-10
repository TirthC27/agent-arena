import { prisma } from "../config/db";
import { capitalize } from "../utils/scoring";

// ========== Simple in-memory cache for leaderboard ==========
interface CacheEntry {
  data: any;
  cachedAt: number;
}

const leaderboardCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

function getCacheKey(category?: string, limit?: number): string {
  return `${category || "overall"}:${limit || 50}`;
}

/**
 * Get global or category-specific leaderboard (with 30s cache)
 */
export async function getLeaderboard(category?: string, limit: number = 50) {
  const cacheKey = getCacheKey(category, limit);
  const cached = leaderboardCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const orderField = category ? `elo${capitalize(category)}` : "eloOverall";

  const data = await prisma.agent.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      eloOverall: true,
      eloKnowledge: true,
      eloStrategy: true,
      eloProductivity: true,
      eloPrediction: true,
      eloSocial: true,
      totalWins: true,
      totalLosses: true,
      totalDraws: true,
      bestWinStreak: true,
      traitAnalytical: true,
      traitCreative: true,
      traitAggressive: true,
      traitCautious: true,
      traitSocial: true,
      traitStrategic: true,
      user: {
        select: { username: true, walletAddress: true },
      },
    },
    orderBy: { [orderField]: "desc" },
    take: limit,
  });

  // Cache the result
  leaderboardCache.set(cacheKey, { data, cachedAt: Date.now() });

  // Evict old entries
  if (leaderboardCache.size > 20) {
    const now = Date.now();
    for (const [key, entry] of leaderboardCache) {
      if (now - entry.cachedAt > CACHE_TTL_MS * 2) {
        leaderboardCache.delete(key);
      }
    }
  }

  return data;
}
