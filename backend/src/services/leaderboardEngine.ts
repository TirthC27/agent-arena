// ============================================================
// LEADERBOARD ENGINE
// Realtime rankings with Redis-backed sorted sets
// ============================================================

import { prisma } from "../config/db";
import { cacheGet, cacheSet, getRedis, CACHE_KEYS } from "../config/redis";
import { torqueClient } from "./torque/torqueClient";

// ============================================================
// Leaderboard Types
// ============================================================

export type LeaderboardType =
  | "global"
  | "domain_music"
  | "domain_coding"
  | "domain_strategy"
  | "domain_knowledge"
  | "domain_prediction"
  | "domain_social"
  | "domain_debate"
  | "weekly"
  | "monthly"
  | "rising_stars"
  | "win_streak"
  | "highest_xp"
  | "most_trained"
  | "richest";

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  agentName: string;
  avatarUrl: string | null;
  level: number;
  score: number;
  xp: number;
  wins: number;
  winStreak: number;
  dominantDomain: string | null;
  specializationTag: string | null;
  userId: string;
  username: string | null;
}

// ============================================================
// Build / Refresh Leaderboards
// ============================================================

export async function refreshGlobalLeaderboard(): Promise<void> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true, totalBattles: { gte: 1 } },
    orderBy: { eloOverall: "desc" },
    take: 200,
    include: {
      user: { select: { username: true } },
    },
  });

  // Upsert DB entries
  for (let i = 0; i < agents.length; i++) {
    await prisma.leaderboardEntry.upsert({
      where: {
        agentId_type_period: {
          agentId: agents[i].id,
          type: "global",
          period: null as any,
        },
      },
      create: {
        agentId: agents[i].id,
        type: "global",
        rank: i + 1,
        score: agents[i].eloOverall,
        period: undefined,
      },
      update: {
        rank: i + 1,
        score: agents[i].eloOverall,
      },
    });
  }

  // Cache the top 50
  const top50 = agents.slice(0, 50).map((a, i) =>
    formatEntry(a, i + 1, a.eloOverall)
  );
  await cacheSet(CACHE_KEYS.leaderboard("global"), top50, 60);

  console.log(`[Leaderboard] Refreshed global: ${agents.length} agents`);
}

export async function refreshDomainLeaderboard(domain: string): Promise<void> {
  const eloField = `elo${capitalize(domain)}` as any;

  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { [eloField]: "desc" },
    take: 100,
    include: { user: { select: { username: true } } },
  });

  const top = agents.slice(0, 50).map((a, i) =>
    formatEntry(a, i + 1, (a as any)[eloField] || a.eloOverall)
  );

  await cacheSet(CACHE_KEYS.leaderboard(`domain_${domain}`), top, 120);
}

export async function refreshWeeklyLeaderboard(): Promise<void> {
  const weekStart = getWeekStart();
  const period = getPeriod("weekly");

  const battles = await prisma.battle.findMany({
    where: {
      status: "completed",
      completedAt: { gte: weekStart },
    },
    select: {
      winnerId: true,
      xpAwarded1: true,
      xpAwarded2: true,
      agent1Id: true,
      agent2Id: true,
    },
  });

  // Tally weekly XP
  const weeklyXP: Record<string, number> = {};
  for (const b of battles) {
    if (b.winnerId) {
      weeklyXP[b.winnerId] = (weeklyXP[b.winnerId] || 0) + 100;
    }
    weeklyXP[b.agent1Id] = (weeklyXP[b.agent1Id] || 0) + b.xpAwarded1;
    weeklyXP[b.agent2Id] = (weeklyXP[b.agent2Id] || 0) + b.xpAwarded2;
  }

  const sorted = Object.entries(weeklyXP).sort(([, a], [, b]) => b - a).slice(0, 50);

  const agents = await prisma.agent.findMany({
    where: { id: { in: sorted.map(([id]) => id) } },
    include: { user: { select: { username: true } } },
  });

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const entries: LeaderboardEntry[] = sorted
    .map(([agentId, xp], i) => {
      const a = agentMap.get(agentId);
      if (!a) return null;
      return formatEntry(a, i + 1, xp);
    })
    .filter(Boolean) as LeaderboardEntry[];

  await cacheSet(CACHE_KEYS.leaderboard("weekly", period), entries, 120);
}

export async function refreshRisingStars(): Promise<void> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Agents who gained the most ELO in the last 24h
  const recentBattles = await prisma.battle.findMany({
    where: {
      status: "completed",
      completedAt: { gte: dayAgo },
    },
    select: {
      winnerId: true,
      agent1Id: true,
      agent2Id: true,
      eloChange1: true,
      eloChange2: true,
    },
  });

  const eloGain: Record<string, number> = {};
  for (const b of recentBattles) {
    eloGain[b.agent1Id] = (eloGain[b.agent1Id] || 0) + Math.max(0, b.eloChange1 || 0);
    eloGain[b.agent2Id] = (eloGain[b.agent2Id] || 0) + Math.max(0, b.eloChange2 || 0);
  }

  const sorted = Object.entries(eloGain).sort(([, a], [, b]) => b - a).slice(0, 20);

  const agents = await prisma.agent.findMany({
    where: { id: { in: sorted.map(([id]) => id) } },
    include: { user: { select: { username: true } } },
  });

  const agentMap = new Map(agents.map((a) => [a.id, a]));
  const entries: LeaderboardEntry[] = sorted
    .map(([agentId, gain], i) => {
      const a = agentMap.get(agentId);
      if (!a) return null;
      return formatEntry(a, i + 1, gain);
    })
    .filter(Boolean) as LeaderboardEntry[];

  await cacheSet(CACHE_KEYS.leaderboard("rising_stars"), entries, 300);
}

// ============================================================
// Get Leaderboard
// ============================================================

export async function getLeaderboard(
  type: LeaderboardType,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const period = type === "weekly" ? getPeriod("weekly") : type === "monthly" ? getPeriod("monthly") : undefined;
  const cached = await cacheGet<LeaderboardEntry[]>(CACHE_KEYS.leaderboard(type, period));

  if (cached) return cached.slice(0, limit);

  // Fallback: build on-demand
  if (type === "global") {
    await refreshGlobalLeaderboard();
  } else if (type.startsWith("domain_")) {
    const domain = type.replace("domain_", "");
    await refreshDomainLeaderboard(domain);
  } else if (type === "weekly") {
    await refreshWeeklyLeaderboard();
  } else if (type === "rising_stars") {
    await refreshRisingStars();
  } else if (type === "win_streak") {
    return getWinStreakLeaderboard(limit);
  } else if (type === "highest_xp") {
    return getHighestXPLeaderboard(limit);
  }

  const result = await cacheGet<LeaderboardEntry[]>(CACHE_KEYS.leaderboard(type, period));
  return (result || []).slice(0, limit);
}

async function getWinStreakLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true, bestWinStreak: { gte: 1 } },
    orderBy: { bestWinStreak: "desc" },
    take: limit,
    include: { user: { select: { username: true } } },
  });
  return agents.map((a, i) => formatEntry(a, i + 1, a.bestWinStreak));
}

async function getHighestXPLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { xp: "desc" },
    take: limit,
    include: { user: { select: { username: true } } },
  });
  return agents.map((a, i) => formatEntry(a, i + 1, a.xp));
}

// ============================================================
// Sync to Torque (for campaigns)
// ============================================================

export async function syncCampaignLeaderboardToTorque(
  campaignId: string,
  torqueCampaignId: string
): Promise<void> {
  const entries = await prisma.campaignEntry.findMany({
    where: { campaignId },
    orderBy: { score: "desc" },
    take: 100,
    include: {
      agent: { include: { user: { select: { id: true } } } },
    },
  });

  const torqueEntries = entries.map((e, i) => ({
    userId: e.agent.user.id,
    score: e.score,
    rank: i + 1,
  }));

  await torqueClient.syncLeaderboard(torqueCampaignId, torqueEntries);
}

// ============================================================
// Helpers
// ============================================================

function formatEntry(
  agent: any,
  rank: number,
  score: number
): LeaderboardEntry {
  return {
    rank,
    agentId: agent.id,
    agentName: agent.name,
    avatarUrl: agent.avatarUrl,
    level: agent.level,
    score,
    xp: agent.xp,
    wins: agent.totalWins,
    winStreak: agent.bestWinStreak,
    dominantDomain: agent.dominantDomain,
    specializationTag: agent.specializationTag,
    userId: agent.userId,
    username: agent.user?.username || null,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getWeekStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function getPeriod(type: "weekly" | "monthly"): string {
  const d = new Date();
  if (type === "weekly") {
    const week = Math.ceil(d.getDate() / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
