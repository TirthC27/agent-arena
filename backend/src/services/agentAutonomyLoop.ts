// ============================================================
// AGENT AUTONOMY LOOP
// Background worker that drives all agent autonomy
// No static campaigns, no fake decisions — all GPT-4o
// ============================================================

import { prisma } from "../config/db";
import { runAgentDecisionLoop } from "./agentDecisionEngine";
import { generateAgentThought } from "./agentThoughtEngine";
import { distributeCampaignRewards } from "./torque/torqueRewardEngine";
import { processExpiredRaffles } from "./torque/torqueRaffleEngine";
import { syncAllActiveLeaderboards } from "./torque/torqueLeaderboardSync";
import { getEcosystemEngagement } from "./torque/torqueEngagementEngine";
import { cacheDel, CACHE_KEYS } from "../config/redis";

// ============================================================
// Strategy Evolution Loop
// Agents periodically reconsider their strategy
// ============================================================

export async function runStrategyEvolution(): Promise<number> {
  console.log("[Autonomy] Running strategy evolution...");

  // Get agents that haven't had a strategic thought recently
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours

  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      level: { gte: 2 }, // Level 2+ agents evolve strategy
    },
    select: { id: true, name: true, level: true },
    orderBy: { xp: "desc" },
    take: 10,
  });

  let evolved = 0;

  for (const agent of agents) {
    // Check if agent had a recent strategic thought
    const recentThought = await prisma.agentThought.findFirst({
      where: {
        agentId: agent.id,
        type: "strategic_analysis",
        createdAt: { gte: cutoff },
      },
    });

    if (recentThought) continue;

    try {
      await generateAgentThought(agent.id, "strategic_analysis");
      evolved++;
      await new Promise((r) => setTimeout(r, 3000)); // Rate limit
    } catch (err: any) {
      console.error(`[Autonomy] Strategy evolution failed for ${agent.name}:`, err.message);
    }
  }

  console.log(`[Autonomy] ${evolved} agents evolved strategy`);
  return evolved;
}

// ============================================================
// Campaign Lifecycle Worker
// Completes expired campaigns and distributes rewards
// ============================================================

export async function processCampaignLifecycle(): Promise<{ completed: number; rewarded: number }> {
  const now = new Date();

  // Find expired active campaigns
  const expired = await prisma.campaign.findMany({
    where: { status: "active", endAt: { lt: now } },
    include: {
      entries: {
        orderBy: { score: "desc" },
        take: 10,
      },
      _count: { select: { entries: true } },
    },
  });

  let completed = 0;
  let rewarded = 0;

  for (const campaign of expired) {
    // Mark as completed
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "completed" },
    });

    // Assign final ranks
    for (let i = 0; i < campaign.entries.length; i++) {
      await prisma.campaignEntry.update({
        where: { id: campaign.entries[i].id },
        data: { rank: i + 1 },
      });
    }

    // Distribute rewards
    const distributed = await distributeCampaignRewards(campaign.id);
    rewarded += distributed;
    completed++;

    console.log(`[Lifecycle] Completed campaign "${campaign.name}" — ${distributed} rewards distributed`);

    // WebSocket broadcast
    const io = (global as any).io;
    if (io) {
      io.emit("campaign:completed", {
        campaignId: campaign.id,
        campaignName: campaign.name,
        participantCount: campaign._count.entries,
        winner: campaign.entries[0] ? {
          agentId: campaign.entries[0].agentId,
          score: campaign.entries[0].score,
        } : null,
      });
    }
  }

  // Invalidate campaign caches
  if (completed > 0) {
    await cacheDel(CACHE_KEYS.campaignList("active"), CACHE_KEYS.campaignList("completed"));
  }

  return { completed, rewarded };
}

// ============================================================
// Memory Compression Worker
// Compress old memories to save context window space
// ============================================================

export async function compressAgentMemories(): Promise<number> {
  // Find agents with too many memories
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  let compressed = 0;

  for (const agent of agents) {
    const memoryCount = await prisma.agentMemory.count({
      where: { agentId: agent.id },
    });

    // If more than 50 memories, archive old ones
    if (memoryCount > 50) {
      const oldMemories = await prisma.agentMemory.findMany({
        where: { agentId: agent.id },
        orderBy: { createdAt: "asc" },
        take: memoryCount - 30, // Keep the 30 most recent
      });

      // Delete old low-weight memories
      const toDelete = oldMemories.filter((m) => m.weight < 1.5);
      if (toDelete.length > 0) {
        await prisma.agentMemory.deleteMany({
          where: { id: { in: toDelete.map((m) => m.id) } },
        });
        compressed += toDelete.length;
      }
    }
  }

  if (compressed > 0) {
    console.log(`[Memory] Compressed ${compressed} old memories`);
  }

  return compressed;
}

// ============================================================
// Personality Drift Worker
// Agent traits shift based on recent performance
// ============================================================

export async function applyPersonalityDrift(): Promise<number> {
  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      traitConfidence: true,
      traitRiskAppetite: true,
      traitCompetitive: true,
      traitAdaptability: true,
      totalWins: true,
      totalLosses: true,
      winStreak: true,
    },
  });

  let drifted = 0;

  for (const agent of agents) {
    const recentBattles = await prisma.battle.findMany({
      where: {
        OR: [{ agent1Id: agent.id }, { agent2Id: agent.id }],
        status: "completed",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      select: { winnerId: true },
    });

    if (recentBattles.length === 0) continue;

    const recentWins = recentBattles.filter((b) => b.winnerId === agent.id).length;
    const recentLosses = recentBattles.length - recentWins;
    const recentWinRate = recentWins / recentBattles.length;

    // Trait drift based on recent performance
    const updates: Record<string, number> = {};

    // Confidence increases with wins, decreases with losses
    if (recentWinRate > 0.6) {
      updates.traitConfidence = Math.min(100, agent.traitConfidence + 2);
    } else if (recentWinRate < 0.4) {
      updates.traitConfidence = Math.max(10, agent.traitConfidence - 2);
    }

    // Risk appetite increases with win streaks
    if (agent.winStreak >= 3) {
      updates.traitRiskAppetite = Math.min(100, agent.traitRiskAppetite + 1);
    } else if (recentLosses >= 3) {
      updates.traitRiskAppetite = Math.max(10, agent.traitRiskAppetite - 2);
    }

    // Competitiveness increases with battles
    if (recentBattles.length >= 3) {
      updates.traitCompetitive = Math.min(100, agent.traitCompetitive + 1);
    }

    // Adaptability increases with losses (learning from failure)
    if (recentLosses > recentWins) {
      updates.traitAdaptability = Math.min(100, agent.traitAdaptability + 1);
    }

    if (Object.keys(updates).length > 0) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: updates,
      });
      drifted++;
    }
  }

  if (drifted > 0) {
    console.log(`[Personality] ${drifted} agents experienced personality drift`);
  }

  return drifted;
}

// ============================================================
// Ecosystem Health Check
// ============================================================

export async function runEcosystemHealthCheck(): Promise<void> {
  const engagement = await getEcosystemEngagement();

  console.log(`[Health] Ecosystem: ${engagement.totalActiveLast24h} active agents, ${engagement.totalBattlesLast24h} battles, ${engagement.activeCampaigns} campaigns, avg engagement: ${engagement.avgEngagementScore}`);

  // WebSocket broadcast ecosystem state
  const io = (global as any).io;
  if (io) {
    io.emit("ecosystem:health", {
      ...engagement,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================
// Master Autonomy Orchestrator
// Called by cron — runs all autonomy workers
// ============================================================

export async function runAutonomyOrchestrator(): Promise<void> {
  console.log("[Autonomy] ═══════════════════════════════════");
  console.log("[Autonomy] Starting autonomy orchestration...");

  try {
    // 1. Agent decisions (campaign creation, joining, etc.)
    const decisions = await runAgentDecisionLoop();
    console.log(`[Autonomy] Agent decisions: ${decisions}`);

    // 2. Campaign lifecycle (complete expired, distribute rewards)
    const lifecycle = await processCampaignLifecycle();
    console.log(`[Autonomy] Campaign lifecycle: ${lifecycle.completed} completed, ${lifecycle.rewarded} rewarded`);

    // 3. Raffle processing
    const raffles = await processExpiredRaffles();
    if (raffles > 0) console.log(`[Autonomy] Raffles drawn: ${raffles}`);

    // 4. Leaderboard sync to Torque
    const synced = await syncAllActiveLeaderboards();
    if (synced > 0) console.log(`[Autonomy] Leaderboards synced: ${synced}`);

    // 5. Ecosystem health check
    await runEcosystemHealthCheck();

    console.log("[Autonomy] Orchestration complete ✓");
    console.log("[Autonomy] ═══════════════════════════════════");
  } catch (err: any) {
    console.error("[Autonomy] Orchestration failed:", err.message);
  }
}
