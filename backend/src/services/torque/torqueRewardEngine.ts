// ============================================================
// TORQUE REWARD ENGINE
// AI-driven reward distribution via Torque MCP
// Agents earn rewards through campaigns, not static rules
// ============================================================

import { prisma } from "../../config/db";
import { torqueClient } from "./torqueClient";
import { dispatchTorqueEvent } from "./eventDispatcher";
import { cacheDel, CACHE_KEYS } from "../../config/redis";

// ============================================================
// Distribute Campaign Rewards
// ============================================================

export async function distributeCampaignRewards(campaignId: string): Promise<number> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      entries: {
        orderBy: { score: "desc" },
        include: {
          agent: { select: { id: true, name: true, userId: true, level: true } },
        },
      },
    },
  });

  if (!campaign || campaign.status !== "completed") return 0;

  const totalPrize = campaign.prizePool;
  const entries = campaign.entries;
  if (entries.length === 0) return 0;

  // Dynamic reward distribution based on standings
  const rewardSplit = calculateRewardSplit(entries.length, totalPrize);
  let distributed = 0;

  for (let i = 0; i < Math.min(entries.length, rewardSplit.length); i++) {
    const entry = entries[i];
    const rewardSOL = rewardSplit[i];
    const xpBonus = Math.round((totalPrize * 1000) / (i + 1)); // Top rank gets more XP

    if (rewardSOL <= 0) continue;

    // Create reward record
    const reward = await prisma.reward.create({
      data: {
        campaignId,
        type: i === 0 ? "campaign_winner" : "campaign_participant",
        title: i === 0
          ? `🏆 ${campaign.name} Champion`
          : `${campaign.name} — Rank #${i + 1}`,
        description: `Earned ${rewardSOL} SOL and ${xpBonus} XP in "${campaign.name}"`,
        valueSOL: rewardSOL,
        valueXP: xpBonus,
        rarity: i === 0 ? "legendary" : i < 3 ? "epic" : i < 10 ? "rare" : "common",
      },
    });

    // Credit agent treasury
    const agent = await prisma.agent.findUnique({ where: { id: entry.agentId } });
    if (agent) {
      const balanceBefore = agent.devnetBalance;
      const balanceAfter = balanceBefore + rewardSOL;

      await prisma.agent.update({
        where: { id: entry.agentId },
        data: {
          devnetBalance: balanceAfter,
          xp: { increment: xpBonus },
        },
      });

      await prisma.walletTransaction.create({
        data: {
          agentId: entry.agentId,
          type: "reward_received",
          amount: rewardSOL,
          balanceBefore,
          balanceAfter,
          description: `Campaign reward: ${campaign.name} (Rank #${i + 1})`,
        },
      });

      // Torque reward distribution
      await torqueClient.distributeReward(
        entry.agent.userId,
        i === 0 ? "campaign_winner" : "campaign_placement",
        rewardSOL,
        {
          campaignId,
          campaignName: campaign.name,
          rank: i + 1,
          xpBonus,
        }
      );

      // Torque event
      await dispatchTorqueEvent({
        userId: entry.agent.userId,
        agentId: entry.agentId,
        eventType: "reward_claimed",
        metadata: {
          campaignId,
          rewardSOL,
          xpBonus,
          rank: i + 1,
        },
      });

      // Store memory
      await prisma.agentMemory.create({
        data: {
          agentId: entry.agentId,
          type: "campaign_result",
          content: `Finished rank #${i + 1} in "${campaign.name}". Earned ${rewardSOL} SOL and ${xpBonus} XP.`,
          weight: i === 0 ? 2.0 : 1.0,
          metadata: { campaignId, rank: i + 1 },
        },
      });
    }

    await prisma.campaignEntry.update({
      where: { id: entry.id },
      data: { rank: i + 1, rewardClaimed: true },
    });

    distributed++;
  }

  // Credit campaign creator if they exist
  if (campaign.creatorAgentId) {
    const creatorBonus = totalPrize * 0.05; // 5% creator bonus
    const creator = await prisma.agent.findUnique({ where: { id: campaign.creatorAgentId } });
    if (creator && creatorBonus > 0) {
      const balanceBefore = creator.devnetBalance;
      await prisma.agent.update({
        where: { id: campaign.creatorAgentId },
        data: { devnetBalance: { increment: creatorBonus } },
      });
      await prisma.walletTransaction.create({
        data: {
          agentId: campaign.creatorAgentId,
          type: "reward_received",
          amount: creatorBonus,
          balanceBefore,
          balanceAfter: balanceBefore + creatorBonus,
          description: `Campaign creator bonus: ${campaign.name}`,
        },
      });
    }
  }

  console.log(`[RewardEngine] Distributed rewards for "${campaign.name}": ${distributed} recipients, ${totalPrize} SOL total`);

  // WebSocket broadcast
  const io = (global as any).io;
  if (io) {
    io.emit("rewards:distributed", {
      campaignId,
      campaignName: campaign.name,
      totalPrize,
      recipientCount: distributed,
    });
  }

  return distributed;
}

// ============================================================
// Reward Split Calculator
// ============================================================

function calculateRewardSplit(participantCount: number, totalPrize: number): number[] {
  if (participantCount <= 0 || totalPrize <= 0) return [];

  // Top-heavy distribution
  const splits: number[] = [];
  const maxRewards = Math.min(participantCount, 10);

  if (maxRewards === 1) return [totalPrize];

  // Distribution: 40% first, 25% second, 15% third, remainder split among 4-10
  const percentages = [0.40, 0.25, 0.15, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.01];

  for (let i = 0; i < maxRewards; i++) {
    splits.push(Math.round((totalPrize * (percentages[i] || 0.01)) * 1000) / 1000);
  }

  return splits;
}

// ============================================================
// Streak Rewards via Torque
// ============================================================

export async function processStreakRewards(
  userId: string,
  agentId: string,
  streakType: string,
  currentStreak: number
): Promise<void> {
  // Streak milestones: 3, 7, 14, 30 days
  const milestones = [3, 7, 14, 30];
  const milestone = milestones.find((m) => currentStreak === m);

  if (!milestone) return;

  const xpBonus = milestone * 50; // 150, 350, 700, 1500 XP
  const solBonus = milestone * 0.01; // 0.03, 0.07, 0.14, 0.30 SOL

  await prisma.agent.update({
    where: { id: agentId },
    data: { xp: { increment: xpBonus } },
  });

  // Credit treasury
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (agent) {
    await prisma.agent.update({
      where: { id: agentId },
      data: { devnetBalance: { increment: solBonus } },
    });
    await prisma.walletTransaction.create({
      data: {
        agentId,
        type: "reward_received",
        amount: solBonus,
        balanceBefore: agent.devnetBalance,
        balanceAfter: agent.devnetBalance + solBonus,
        description: `${streakType} streak milestone: ${milestone} days`,
      },
    });
  }

  // Torque streak tracking
  await torqueClient.recordStreak(userId, streakType, currentStreak);

  await dispatchTorqueEvent({
    userId,
    agentId,
    eventType: "streak_rewarded",
    metadata: { streakType, milestone, xpBonus, solBonus },
  });

  console.log(`[RewardEngine] Streak reward: ${streakType} x${milestone} for agent ${agentId}`);
}
