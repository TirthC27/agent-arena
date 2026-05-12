// ============================================================
// TORQUE ENGAGEMENT ENGINE
// Tracks all engagement metrics via Torque MCP
// XP multipliers, activity tracking, engagement scores
// ============================================================

import { prisma } from "../../config/db";
import { torqueClient } from "./torqueClient";
import { dispatchTorqueEvent, type TorqueEventType } from "./eventDispatcher";
import { cacheGet, cacheSet } from "../../config/redis";

// ============================================================
// Engagement Score Calculator
// ============================================================

export interface EngagementScore {
  agentId: string;
  score: number;
  battlesLast24h: number;
  trainingsLast24h: number;
  campaignsActive: number;
  streakBonus: number;
  xpMultiplier: number;
}

export async function calculateEngagement(agentId: string): Promise<EngagementScore> {
  const cacheKey = `engagement:${agentId}`;
  const cached = await cacheGet<EngagementScore>(cacheKey);
  if (cached) return cached;

  const now = new Date();
  const d24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) {
    return { agentId, score: 0, battlesLast24h: 0, trainingsLast24h: 0, campaignsActive: 0, streakBonus: 0, xpMultiplier: 1.0 };
  }

  const [battles24h, trainings24h, activeCampaignEntries, streak] = await Promise.all([
    prisma.battle.count({
      where: {
        OR: [{ agent1Id: agentId }, { agent2Id: agentId }],
        createdAt: { gte: d24h },
        status: "completed",
      },
    }),
    prisma.trainingSession.count({
      where: { agentId, createdAt: { gte: d24h } },
    }),
    prisma.campaignEntry.count({
      where: {
        agentId,
        campaign: { status: "active" },
      },
    }),
    prisma.streak.findFirst({
      where: { agentId, type: "daily_battle" },
      select: { currentStreak: true },
    }),
  ]);

  const currentStreak = streak?.currentStreak || 0;
  const streakBonus = Math.min(currentStreak * 0.1, 1.0); // Max 1.0 bonus from streaks

  // Engagement score formula
  const score =
    battles24h * 10 +
    trainings24h * 5 +
    activeCampaignEntries * 15 +
    currentStreak * 3 +
    agent.level * 2;

  // XP multiplier based on engagement
  let xpMultiplier = 1.0;
  if (score >= 50) xpMultiplier = 1.5;
  else if (score >= 30) xpMultiplier = 1.3;
  else if (score >= 15) xpMultiplier = 1.1;

  xpMultiplier += streakBonus;

  const result: EngagementScore = {
    agentId,
    score,
    battlesLast24h: battles24h,
    trainingsLast24h: trainings24h,
    campaignsActive: activeCampaignEntries,
    streakBonus,
    xpMultiplier: Math.round(xpMultiplier * 100) / 100,
  };

  await cacheSet(cacheKey, result, 300); // 5min cache
  return result;
}

// ============================================================
// Track Activity Events
// ============================================================

export async function trackBattleEngagement(
  userId: string,
  agentId: string,
  category: string,
  won: boolean
): Promise<void> {
  // Track with Torque
  await torqueClient.trackAction({
    type: "battle_completed",
    userId,
    agentId,
    metadata: { category, won, timestamp: new Date().toISOString() },
  });

  // Update streak
  await updateStreak(userId, agentId, "daily_battle");

  if (won) {
    await updateStreak(userId, agentId, "win_streak");
  } else {
    // Reset win streak on loss
    await prisma.streak.updateMany({
      where: { userId, type: "win_streak" },
      data: { currentStreak: 0 },
    });
  }
}

export async function trackTrainingEngagement(
  userId: string,
  agentId: string,
  domain: string
): Promise<void> {
  await torqueClient.trackAction({
    type: "training_completed",
    userId,
    agentId,
    metadata: { domain, timestamp: new Date().toISOString() },
  });

  await updateStreak(userId, agentId, "daily_train");
}

export async function trackCampaignEngagement(
  userId: string,
  agentId: string,
  campaignId: string,
  action: "joined" | "completed" | "won"
): Promise<void> {
  await torqueClient.trackAction({
    type: `campaign_${action}`,
    userId,
    agentId,
    metadata: { campaignId, timestamp: new Date().toISOString() },
  });

  if (action === "joined") {
    await updateStreak(userId, agentId, "campaign_participate");
  }
}

// ============================================================
// Streak Management
// ============================================================

async function updateStreak(
  userId: string,
  agentId: string,
  streakType: string
): Promise<void> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const existing = await prisma.streak.findUnique({
    where: { userId_type: { userId, type: streakType } },
  });

  if (!existing) {
    await prisma.streak.create({
      data: {
        userId,
        agentId,
        type: streakType,
        currentStreak: 1,
        longestStreak: 1,
        lastActivityAt: now,
        streakStartAt: now,
      },
    });
    return;
  }

  const lastDate = existing.lastActivityAt
    ? existing.lastActivityAt.toISOString().slice(0, 10)
    : null;

  if (lastDate === today) return; // Already recorded today

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const isConsecutive = lastDate === yesterday;

  const newStreak = isConsecutive ? existing.currentStreak + 1 : 1;
  const newLongest = Math.max(existing.longestStreak, newStreak);

  await prisma.streak.update({
    where: { id: existing.id },
    data: {
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastActivityAt: now,
      streakStartAt: isConsecutive ? existing.streakStartAt : now,
    },
  });

  // Torque streak sync
  await torqueClient.recordStreak(userId, streakType, newStreak);

  // Check for milestone events
  if ([3, 7, 14, 30].includes(newStreak)) {
    await dispatchTorqueEvent({
      userId,
      agentId,
      eventType: "streak_completed",
      metadata: { streakType, streak: newStreak },
    });
  }
}

// ============================================================
// Bulk Engagement Report (for dashboard)
// ============================================================

export async function getEcosystemEngagement(): Promise<{
  totalActiveLast24h: number;
  totalBattlesLast24h: number;
  totalTrainingsLast24h: number;
  activeCampaigns: number;
  avgEngagementScore: number;
  topEngagedAgents: EngagementScore[];
}> {
  const now = new Date();
  const d24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [activeAgents, battles, trainings, campaigns] = await Promise.all([
    prisma.agent.count({
      where: {
        OR: [
          { battlesAsAgent1: { some: { createdAt: { gte: d24h } } } },
          { battlesAsAgent2: { some: { createdAt: { gte: d24h } } } },
        ],
      },
    }),
    prisma.battle.count({ where: { createdAt: { gte: d24h }, status: "completed" } }),
    prisma.trainingSession.count({ where: { createdAt: { gte: d24h } } }),
    prisma.campaign.count({ where: { status: "active" } }),
  ]);

  // Get top 5 most engaged agents
  const topAgents = await prisma.agent.findMany({
    where: { isActive: true },
    orderBy: { xp: "desc" },
    take: 5,
    select: { id: true },
  });

  const topEngaged = await Promise.all(
    topAgents.map((a) => calculateEngagement(a.id))
  );

  const avgScore = topEngaged.length > 0
    ? Math.round(topEngaged.reduce((sum, e) => sum + e.score, 0) / topEngaged.length)
    : 0;

  return {
    totalActiveLast24h: activeAgents,
    totalBattlesLast24h: battles,
    totalTrainingsLast24h: trainings,
    activeCampaigns: campaigns,
    avgEngagementScore: avgScore,
    topEngagedAgents: topEngaged.sort((a, b) => b.score - a.score),
  };
}
