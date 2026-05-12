// ============================================================
// AI-POWERED CAMPAIGN ENGINE (AGENT-DRIVEN)
// NO STATIC CAMPAIGNS. NO HARDCODED DATA.
// Every campaign is created by an agent via GPT-4o + Torque MCP
// ============================================================

import { prisma } from "../config/db";
import { torqueClient } from "./torque/torqueClient";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from "../config/redis";
import { agentCreatesCampaign } from "./torque/torqueCampaignAI";
import { distributeCampaignRewards } from "./torque/torqueRewardEngine";

// ============================================================
// Agent-Driven Campaign Generation
// Top agents analyze ecosystem and create campaigns autonomously
// ============================================================

export async function triggerAgentCampaignCreation(): Promise<number> {
  console.log("[CampaignEngine] Triggering agent-driven campaign creation...");

  // Find the top agents eligible to create campaigns
  const eligibleAgents = await prisma.agent.findMany({
    where: {
      isActive: true,
      level: { gte: 2 }, // Must be at least level 2
      devnetBalance: { gte: 0.05 }, // Must have treasury funds
    },
    orderBy: [
      { xp: "desc" },
      { totalWins: "desc" },
    ],
    take: 5,
    select: { id: true, name: true, level: true, devnetBalance: true },
  });

  if (eligibleAgents.length === 0) {
    console.log("[CampaignEngine] No eligible agents for campaign creation");
    return 0;
  }

  // Check if we already have enough active campaigns
  const activeCampaignCount = await prisma.campaign.count({
    where: { status: "active" },
  });

  if (activeCampaignCount >= 10) {
    console.log(`[CampaignEngine] Already ${activeCampaignCount} active campaigns, skipping`);
    return 0;
  }

  let created = 0;
  const maxToCreate = Math.max(1, 5 - activeCampaignCount);

  for (const agent of eligibleAgents) {
    if (created >= maxToCreate) break;

    // Check if this agent recently created a campaign
    const recentCampaign = await prisma.campaign.findFirst({
      where: {
        creatorAgentId: agent.id,
        createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // 6h cooldown
      },
    });

    if (recentCampaign) {
      console.log(`[CampaignEngine] ${agent.name} recently created a campaign, skipping`);
      continue;
    }

    try {
      const result = await agentCreatesCampaign(agent.id);
      if (result) {
        created++;
        console.log(`[CampaignEngine] ✓ Agent "${agent.name}" created campaign ${result.campaignId}`);
      }
      // Rate limit between agents
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`[CampaignEngine] Agent "${agent.name}" campaign creation failed:`, err.message);
    }
  }

  console.log(`[CampaignEngine] ${created} campaigns created by agents`);
  return created;
}

// ============================================================
// Campaign CRUD (database-driven, no static data)
// ============================================================

export async function getActiveCampaigns() {
  const cached = await cacheGet<any[]>(CACHE_KEYS.campaignList("active"));
  if (cached) return cached;

  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "active",
      startAt: { lte: now },
      endAt: { gte: now },
    },
    include: {
      _count: { select: { entries: true } },
      creatorAgent: {
        select: { id: true, name: true, level: true, dominantDomain: true, avatarUrl: true },
      },
    },
    orderBy: { startAt: "desc" },
  });

  await cacheSet(CACHE_KEYS.campaignList("active"), campaigns, 60);
  return campaigns;
}

export async function getCampaignById(id: string) {
  const cached = await cacheGet<any>(CACHE_KEYS.campaignDetail(id));
  if (cached) return cached;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      entries: {
        orderBy: { score: "desc" },
        take: 50,
        include: {
          agent: { select: { id: true, name: true, avatarUrl: true, level: true, eloOverall: true } },
        },
      },
      creatorAgent: {
        select: { id: true, name: true, level: true, dominantDomain: true, avatarUrl: true },
      },
      _count: { select: { entries: true, battles: true } },
    },
  });

  if (!campaign) return null;
  await cacheSet(CACHE_KEYS.campaignDetail(id), campaign, 30);
  return campaign;
}

export async function joinCampaign(campaignId: string, agentId: string, userId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "active") throw new Error("Campaign is not active");

  const now = new Date();
  if (now > campaign.endAt) throw new Error("Campaign has ended");

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error("Agent not found");

  if (campaign.minElo && agent.eloOverall < campaign.minElo) {
    throw new Error(`Minimum ELO of ${campaign.minElo} required`);
  }

  const count = await prisma.campaignEntry.count({ where: { campaignId } });
  if (count >= campaign.maxParticipants) throw new Error("Campaign is full");

  // Check entry fee
  if (campaign.entryFeeSOL > 0 && agent.devnetBalance < campaign.entryFeeSOL) {
    throw new Error("Insufficient treasury for entry fee");
  }

  const entry = await prisma.campaignEntry.upsert({
    where: { campaignId_agentId: { campaignId, agentId } },
    create: { campaignId, agentId, userId },
    update: {},
  });

  // Deduct entry fee
  if (campaign.entryFeeSOL > 0) {
    const balanceBefore = agent.devnetBalance;
    await prisma.agent.update({
      where: { id: agentId },
      data: { devnetBalance: { decrement: campaign.entryFeeSOL } },
    });
    await prisma.walletTransaction.create({
      data: {
        agentId,
        type: "tournament_fee",
        amount: -campaign.entryFeeSOL,
        balanceBefore,
        balanceAfter: balanceBefore - campaign.entryFeeSOL,
        description: `Entry fee for: ${campaign.name}`,
      },
    });
  }

  await cacheDel(CACHE_KEYS.campaignDetail(campaignId), CACHE_KEYS.campaignList("active"));
  return entry;
}

export async function completeCampaigns(): Promise<number> {
  const now = new Date();
  const expired = await prisma.campaign.findMany({
    where: { status: "active", endAt: { lt: now } },
    include: {
      entries: {
        orderBy: { score: "desc" },
        take: 10,
        include: { agent: { select: { userId: true } } },
      },
    },
  });

  let completed = 0;
  for (const campaign of expired) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "completed" },
    });

    for (let i = 0; i < campaign.entries.length; i++) {
      await prisma.campaignEntry.update({
        where: { id: campaign.entries[i].id },
        data: { rank: i + 1 },
      });
    }

    // Distribute rewards via Torque
    await distributeCampaignRewards(campaign.id);

    // End Torque campaign
    if (campaign.torqueCampaignId) {
      await torqueClient.endCampaign(campaign.torqueCampaignId).catch(() => {});
    }

    completed++;
    console.log(`[CampaignEngine] Completed: ${campaign.name}`);
  }

  if (completed > 0) {
    await cacheDel(CACHE_KEYS.campaignList("active"), CACHE_KEYS.campaignList("completed"));
  }

  return completed;
}

// ============================================================
// Campaign Score Update (called from battle service)
// ============================================================

export async function updateCampaignScore(
  campaignId: string,
  agentId: string,
  won: boolean,
  xpGained: number,
  domain: string,
  skillWeights: Record<string, number>
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const weight = (skillWeights[domain] || 1.0) * campaign.xpMultiplier;
  const scoreIncrease = Math.round(xpGained * weight * (won ? 1 : 0.25));
  const raffleTickets = won ? campaign.raffleTicketsPerWin : 0;

  await prisma.campaignEntry.update({
    where: { campaignId_agentId: { campaignId, agentId } },
    data: {
      score: { increment: scoreIncrease },
      wins: won ? { increment: 1 } : undefined,
      losses: !won ? { increment: 1 } : undefined,
      xpEarned: { increment: xpGained },
      raffleTickets: { increment: raffleTickets },
    },
  });

  await cacheDel(CACHE_KEYS.campaignDetail(campaignId));
}

// ============================================================
// Campaign Stats for Dashboard
// ============================================================

export async function getCampaignStats() {
  const [active, completed, totalEntries, agentCreated] = await Promise.all([
    prisma.campaign.count({ where: { status: "active" } }),
    prisma.campaign.count({ where: { status: "completed" } }),
    prisma.campaignEntry.count(),
    prisma.campaign.count({ where: { creatorAgentId: { not: null } } }),
  ]);

  return { active, completed, totalEntries, agentCreated };
}

// ============================================================
// Get Campaigns by Creator Agent
// ============================================================

export async function getCampaignsByCreator(agentId: string) {
  return prisma.campaign.findMany({
    where: { creatorAgentId: agentId },
    include: {
      _count: { select: { entries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
