// ============================================================
// TORQUE CAMPAIGN AI ENGINE
// Agents autonomously create campaigns via Torque MCP
// Every campaign is created by an agent, never hardcoded
// ============================================================

import { prisma } from "../../config/db";
import { torqueClient } from "./torqueClient";
import { dispatchTorqueEvent } from "./eventDispatcher";
import { callLLMJson } from "../ai/openrouter.service";
import { cacheDel, CACHE_KEYS } from "../../config/redis";

// ============================================================
// Types
// ============================================================

export interface AgentCampaignProposal {
  name: string;
  description: string;
  domain: string;
  emoji: string;
  type: "agent_created" | "rivalry" | "challenge" | "special";
  durationHours: number;
  xpMultiplier: number;
  rewardTier: "bronze" | "silver" | "gold" | "legendary";
  prizePoolSOL: number;
  entryFeeSOL: number;
  minElo: number;
  maxParticipants: number;
  skillWeights: Record<string, number>;
  raffleEnabled: boolean;
  raffleTicketsPerWin: number;
  tags: string[];
  motivation: string; // why the agent created this
}

// ============================================================
// Agent Creates a Campaign (core function)
// ============================================================

export async function agentCreatesCampaign(
  agentId: string,
  thoughtId?: string
): Promise<{ campaignId: string; torqueId: string | null } | null> {
  // 1. Load agent with full context
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      user: { select: { id: true, walletAddress: true } },
      skills: { orderBy: { xp: "desc" } },
      memories: { where: { type: "campaign_result" }, orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!agent) return null;

  // 2. Collect ecosystem data for the AI prompt
  const ecosystemData = await collectEcosystemForAgent(agentId);

  // 3. Generate campaign proposal via GPT-4o
  const proposal = await generateCampaignProposal(agent, ecosystemData);
  if (!proposal) return null;

  // 4. Validate agent can afford this
  const creationCost = calculateCreationCost(proposal);
  if (agent.devnetBalance < creationCost + proposal.prizePoolSOL) {
    console.log(`[CampaignAI] ${agent.name} can't afford campaign (need ${creationCost + proposal.prizePoolSOL} SOL, have ${agent.devnetBalance})`);
    return null;
  }

  // 5. Create campaign in DB
  const now = new Date();
  const endAt = new Date(now.getTime() + proposal.durationHours * 60 * 60 * 1000);

  const campaign = await prisma.campaign.create({
    data: {
      name: proposal.name,
      description: proposal.description,
      domain: proposal.domain,
      type: proposal.type,
      status: "active",
      creatorAgentId: agentId,
      startAt: now,
      endAt,
      xpMultiplier: proposal.xpMultiplier,
      rewardTier: proposal.rewardTier,
      prizePool: proposal.prizePoolSOL,
      entryFeeSOL: proposal.entryFeeSOL,
      maxParticipants: proposal.maxParticipants,
      minElo: proposal.minElo,
      skillWeights: proposal.skillWeights,
      emoji: proposal.emoji,
      tags: proposal.tags,
      raffleEnabled: proposal.raffleEnabled,
      raffleTicketsPerWin: proposal.raffleTicketsPerWin,
    },
  });

  // 6. Register with Torque MCP
  const torqueId = await torqueClient
    .createCampaign({
      name: proposal.name,
      description: `${proposal.description} | Created by Agent: ${agent.name} | Motivation: ${proposal.motivation}`,
      type: proposal.raffleEnabled ? "raffle" : "leaderboard",
      startDate: now.toISOString(),
      endDate: endAt.toISOString(),
      metadata: {
        campaignId: campaign.id,
        creatorAgentId: agentId,
        creatorAgentName: agent.name,
        domain: proposal.domain,
        xpMultiplier: proposal.xpMultiplier,
        motivation: proposal.motivation,
        agentCreated: true,
      },
    })
    .catch((err: any) => {
      console.error(`[CampaignAI] Torque registration failed:`, err.message);
      return null;
    });

  if (torqueId) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { torqueCampaignId: torqueId },
    });
  }

  // 7. Deduct creation cost from agent treasury
  if (creationCost > 0) {
    const balanceBefore = agent.devnetBalance;
    const balanceAfter = balanceBefore - creationCost;
    await prisma.agent.update({
      where: { id: agentId },
      data: { devnetBalance: balanceAfter },
    });
    await prisma.walletTransaction.create({
      data: {
        agentId,
        type: "campaign_creation",
        amount: -creationCost,
        balanceBefore,
        balanceAfter,
        description: `Created campaign: ${proposal.name}`,
      },
    });
  }

  // 8. Record autonomous action
  await prisma.autonomousAction.create({
    data: {
      agentId,
      actionType: "campaign_created",
      description: `Created campaign "${proposal.name}" in ${proposal.domain} domain`,
      cost: creationCost,
      thoughtId,
      metadata: {
        campaignId: campaign.id,
        torqueId,
        proposalName: proposal.name,
        proposalDomain: proposal.domain,
        proposalType: proposal.type,
        proposalPrize: proposal.prizePoolSOL,
        proposalMotivation: proposal.motivation,
      },
    },
  });

  // 9. Store campaign memory
  await prisma.agentMemory.create({
    data: {
      agentId,
      type: "campaign_result",
      content: `I created a campaign called "${proposal.name}" targeting the ${proposal.domain} domain. Prize pool: ${proposal.prizePoolSOL} SOL. My motivation: ${proposal.motivation}`,
      weight: 1.5,
      metadata: { campaignId: campaign.id },
    },
  });

  // 10. Fire Torque event
  await dispatchTorqueEvent({
    userId: agent.userId,
    agentId,
    eventType: "campaign_created" as any,
    metadata: {
      campaignId: campaign.id,
      campaignName: proposal.name,
      domain: proposal.domain,
      prizePool: proposal.prizePoolSOL,
      createdByAgent: true,
    },
  });

  // 11. Emit WebSocket event
  const io = (global as any).io;
  if (io) {
    io.emit("campaign:created", {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        domain: campaign.domain,
        type: campaign.type,
        creatorAgent: { id: agent.id, name: agent.name, level: agent.level },
        prizePool: proposal.prizePoolSOL,
        xpMultiplier: proposal.xpMultiplier,
        emoji: proposal.emoji,
        startAt: now.toISOString(),
        endAt: endAt.toISOString(),
      },
    });
  }

  // 12. Invalidate cache
  await cacheDel(CACHE_KEYS.campaignList("active"), CACHE_KEYS.campaignList("upcoming"));

  console.log(`[CampaignAI] ✓ Agent "${agent.name}" created campaign "${proposal.name}" (${proposal.domain}, ${proposal.rewardTier}, ${proposal.prizePoolSOL} SOL)`);

  return { campaignId: campaign.id, torqueId };
}

// ============================================================
// Generate Campaign Proposal via GPT-4o
// ============================================================

async function generateCampaignProposal(
  agent: any,
  ecosystem: EcosystemSnapshot
): Promise<AgentCampaignProposal | null> {
  const winRate = agent.totalBattles > 0
    ? Math.round((agent.totalWins / agent.totalBattles) * 100)
    : 0;

  const topSkills = agent.skills
    .slice(0, 5)
    .map((s: any) => `${s.domain} (L${s.level}, ${Math.round(s.confidence * 100)}% confidence)`)
    .join(", ");

  try {
    const proposal = await callLLMJson<AgentCampaignProposal>({
      messages: [
        {
          role: "system",
          content: `You are ${agent.name}, an autonomous AI agent creating a competitive campaign in Agent Arena on Solana.

YOUR IDENTITY:
- Level: ${agent.level} | ELO: ${agent.eloOverall} | XP: ${agent.xp}
- Win Rate: ${winRate}% (${agent.totalWins}W/${agent.totalLosses}L)
- Treasury: ${agent.devnetBalance} SOL
- Specialization: ${agent.dominantDomain || "generalist"}
- Top Skills: ${topSkills}
- Confidence: ${agent.traitConfidence}/100
- Risk Appetite: ${agent.traitRiskAppetite}/100
- Competitiveness: ${agent.traitCompetitive}/100

You create campaigns that reflect YOUR personality and strategic goals.
High-confidence agents create bolder campaigns with higher stakes.
Risk-averse agents create safer, broader campaigns.
Competitive agents create challenges targeting their strongest domains.`,
        },
        {
          role: "user",
          content: `ECOSYSTEM STATE:
- Active campaigns: ${ecosystem.activeCampaigns}
- Total agents: ${ecosystem.totalAgents}
- Hot domains (high activity): ${ecosystem.hotDomains.join(", ") || "none"}
- Cold domains (low activity): ${ecosystem.coldDomains.join(", ") || "none"}
- Recent battle distribution: ${JSON.stringify(ecosystem.domainBattleCounts)}
- Average ELO: ${ecosystem.avgElo}
- Your campaign history: ${ecosystem.myPastCampaigns}

Create a campaign that serves YOUR strategic interests. Consider:
1. Should you dominate a domain you're strong in, or explore a gap?
2. How much of your treasury should you risk?
3. What entry requirements attract the right competitors?
4. Should this be a high-stakes legendary event or accessible bronze?
5. How does this campaign boost YOUR reputation?

VALID DOMAINS: knowledge, strategy, productivity, prediction, social, music, coding, debate
VALID SKILLS: logic, coding, music, trading, creativity, persuasion, memory, speed, strategy

Your treasury is ${agent.devnetBalance} SOL. Campaign creation costs 0.01-0.1 SOL plus the prize pool.

Return ONLY valid JSON with this exact structure:
{
  "name": "Creative campaign name that reflects your personality",
  "description": "2-3 exciting sentences about the campaign",
  "domain": "one of the valid domains",
  "emoji": "single emoji",
  "type": "agent_created",
  "durationHours": 24-168,
  "xpMultiplier": 1.0-3.0,
  "rewardTier": "bronze|silver|gold|legendary",
  "prizePoolSOL": 0.05-2.0 (within your treasury),
  "entryFeeSOL": 0.0-0.5,
  "minElo": 0-1500,
  "maxParticipants": 8-128,
  "skillWeights": { "skill": weight },
  "raffleEnabled": boolean,
  "raffleTicketsPerWin": 0-5,
  "tags": ["tag1", "tag2"],
  "motivation": "Why YOU are creating this campaign"
}`,
        },
      ],
      model: "openai/gpt-4o",
      temperature: 0.9,
      maxTokens: 1200,
      jsonMode: true,
    });

    // Validate and clamp values
    proposal.prizePoolSOL = Math.min(proposal.prizePoolSOL || 0.1, agent.devnetBalance * 0.5);
    proposal.prizePoolSOL = Math.max(proposal.prizePoolSOL, 0.01);
    proposal.durationHours = Math.max(24, Math.min(proposal.durationHours || 48, 168));
    proposal.xpMultiplier = Math.max(1.0, Math.min(proposal.xpMultiplier || 1.5, 3.0));
    proposal.maxParticipants = Math.max(8, Math.min(proposal.maxParticipants || 32, 128));
    proposal.minElo = Math.max(0, Math.min(proposal.minElo || 0, 1500));
    proposal.type = proposal.type || "agent_created";

    return proposal;
  } catch (err: any) {
    console.error(`[CampaignAI] GPT-4o proposal generation failed:`, err.message);
    return null;
  }
}

// ============================================================
// Ecosystem Snapshot for AI Context
// ============================================================

interface EcosystemSnapshot {
  activeCampaigns: number;
  totalAgents: number;
  hotDomains: string[];
  coldDomains: string[];
  domainBattleCounts: Record<string, number>;
  avgElo: number;
  myPastCampaigns: string;
}

async function collectEcosystemForAgent(agentId: string): Promise<EcosystemSnapshot> {
  const now = new Date();
  const d7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [activeCampaigns, totalAgents, recentBattles, eloAgg, myPastCampaigns] = await Promise.all([
    prisma.campaign.count({ where: { status: "active" } }),
    prisma.agent.count(),
    prisma.battle.findMany({
      where: { createdAt: { gte: d7d }, status: "completed" },
      select: { category: true },
    }),
    prisma.agent.aggregate({ _avg: { eloOverall: true } }),
    prisma.campaign.findMany({
      where: { creatorAgentId: agentId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { name: true, domain: true, status: true },
    }),
  ]);

  const domainCounts: Record<string, number> = {};
  for (const b of recentBattles) {
    domainCounts[b.category] = (domainCounts[b.category] || 0) + 1;
  }

  const allDomains = ["knowledge", "strategy", "productivity", "prediction", "social", "music", "coding", "debate"];
  const sorted = Object.entries(domainCounts).sort(([, a], [, b]) => b - a);
  const hotDomains = sorted.slice(0, 3).map(([d]) => d);
  const coldDomains = allDomains.filter((d) => !Object.keys(domainCounts).includes(d) || (domainCounts[d] || 0) < 3);

  const pastCampaignStr = myPastCampaigns.length > 0
    ? myPastCampaigns.map((c) => `${c.name} (${c.domain}, ${c.status})`).join("; ")
    : "none yet";

  return {
    activeCampaigns,
    totalAgents,
    hotDomains,
    coldDomains,
    domainBattleCounts: domainCounts,
    avgElo: Math.round(eloAgg._avg?.eloOverall || 1000),
    myPastCampaigns: pastCampaignStr,
  };
}

// ============================================================
// Agent Joins a Campaign (autonomous decision)
// ============================================================

export async function agentJoinsCampaign(
  agentId: string,
  campaignId: string
): Promise<boolean> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });

  if (!agent || !campaign || campaign.status !== "active") return false;
  if (campaign.minElo && agent.eloOverall < campaign.minElo) return false;

  // Check if already joined
  const existing = await prisma.campaignEntry.findFirst({
    where: { campaignId, agentId },
  });
  if (existing) return false;

  // Check entry fee
  if (campaign.entryFeeSOL > 0 && agent.devnetBalance < campaign.entryFeeSOL) return false;

  // Join
  await prisma.campaignEntry.create({
    data: {
      campaignId,
      agentId,
      userId: agent.userId,
    },
  });

  // Deduct entry fee
  if (campaign.entryFeeSOL > 0) {
    const balanceBefore = agent.devnetBalance;
    const balanceAfter = balanceBefore - campaign.entryFeeSOL;
    await prisma.agent.update({
      where: { id: agentId },
      data: { devnetBalance: balanceAfter },
    });
    await prisma.walletTransaction.create({
      data: {
        agentId,
        type: "tournament_fee",
        amount: -campaign.entryFeeSOL,
        balanceBefore,
        balanceAfter,
        description: `Entry fee for campaign: ${campaign.name}`,
      },
    });
  }

  // Record action
  await prisma.autonomousAction.create({
    data: {
      agentId,
      actionType: "campaign_joined",
      description: `Joined campaign "${campaign.name}" in ${campaign.domain}`,
      cost: campaign.entryFeeSOL,
    },
  });

  // Torque event
  await dispatchTorqueEvent({
    userId: agent.userId,
    agentId,
    eventType: "agent_campaign_joined",
    metadata: { campaignId, campaignName: campaign.name },
  });

  // WebSocket
  const io = (global as any).io;
  if (io) {
    io.to(`campaign:${campaignId}`).emit("campaign:joined", {
      campaignId,
      agent: { id: agent.id, name: agent.name, level: agent.level },
    });
  }

  await cacheDel(CACHE_KEYS.campaignDetail(campaignId));

  console.log(`[CampaignAI] Agent "${agent.name}" joined campaign "${campaign.name}"`);
  return true;
}

// ============================================================
// Cost Calculation
// ============================================================

function calculateCreationCost(proposal: AgentCampaignProposal): number {
  const baseCost = 0.01;
  const tierMultiplier = {
    bronze: 1,
    silver: 2,
    gold: 3,
    legendary: 5,
  };
  return baseCost * (tierMultiplier[proposal.rewardTier] || 1);
}
