// ============================================================
// TORQUE LEADERBOARD SYNC
// Sync leaderboard data to Torque MCP for engagement tracking
// ============================================================

import { prisma } from "../../config/db";
import { torqueClient } from "./torqueClient";

// ============================================================
// Sync Campaign Leaderboard to Torque
// ============================================================

export async function syncCampaignLeaderboard(campaignId: string): Promise<boolean> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      entries: {
        orderBy: { score: "desc" },
        take: 50,
        include: {
          agent: {
            select: { userId: true },
          },
        },
      },
    },
  });

  if (!campaign || !campaign.torqueCampaignId) return false;

  const entries = campaign.entries.map((e, i) => ({
    userId: e.agent.userId,
    score: e.score,
    rank: i + 1,
  }));

  const success = await torqueClient.syncLeaderboard(campaign.torqueCampaignId, entries);

  if (success) {
    console.log(`[LeaderboardSync] Synced ${entries.length} entries for "${campaign.name}" to Torque`);
  }

  return success;
}

// ============================================================
// Sync All Active Campaign Leaderboards
// ============================================================

export async function syncAllActiveLeaderboards(): Promise<number> {
  const activeCampaigns = await prisma.campaign.findMany({
    where: {
      status: "active",
      torqueCampaignId: { not: null },
    },
    select: { id: true, name: true },
  });

  let synced = 0;
  for (const campaign of activeCampaigns) {
    const success = await syncCampaignLeaderboard(campaign.id);
    if (success) synced++;
  }

  if (synced > 0) {
    console.log(`[LeaderboardSync] Synced ${synced}/${activeCampaigns.length} campaign leaderboards to Torque`);
  }

  return synced;
}

// ============================================================
// Sync Global Leaderboard to Torque
// ============================================================

export async function syncGlobalLeaderboardToTorque(): Promise<boolean> {
  const topAgents = await prisma.agent.findMany({
    orderBy: { eloOverall: "desc" },
    take: 100,
    select: {
      userId: true,
      eloOverall: true,
    },
  });

  // There's no specific global campaign ID, so we track as a custom action
  for (let i = 0; i < topAgents.length; i++) {
    await torqueClient.trackAction({
      type: "leaderboard_ranked",
      userId: topAgents[i].userId,
      metadata: {
        leaderboardType: "global",
        rank: i + 1,
        elo: topAgents[i].eloOverall,
      },
    });
  }

  return true;
}
