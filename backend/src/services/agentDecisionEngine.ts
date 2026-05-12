// ============================================================
// AGENT DECISION ENGINE
// Core AI reasoning: agents decide what to do autonomously
// Every decision is a real GPT-4o call — no fake autonomy
// ============================================================

import { prisma } from "../config/db";
import { callLLMJson } from "./ai/openrouter.service";
import { generateAgentThought, collectAgentContext, ThoughtType } from "./agentThoughtEngine";
import { agentCreatesCampaign, agentJoinsCampaign } from "./torque/torqueCampaignAI";
import { dispatchTorqueEvent } from "./torque/eventDispatcher";
import { cacheDel, CACHE_KEYS } from "../config/redis";

// ============================================================
// Types
// ============================================================

interface AgentDecision {
  action: "create_campaign" | "join_campaign" | "challenge_rival" | "train" | "wait" | "create_raffle" | "conserve_treasury";
  confidence: number;
  reasoning: string;
  targetId?: string; // campaign ID or agent ID
  parameters?: Record<string, any>;
}

interface EcosystemMetrics {
  activeCampaigns: number;
  totalAgents: number;
  activeAgentsLast24h: number;
  hotDomains: string[];
  coldDomains: string[];
  domainBattleCounts: Record<string, number>;
  avgElo: number;
  recentCampaignCreators: string[];
  openCampaignsToJoin: Array<{ id: string; name: string; domain: string; minElo: number; entryFeeSOL: number; participantCount: number }>;
}

// ============================================================
// Collect Ecosystem Metrics
// ============================================================

async function collectEcosystemMetrics(): Promise<EcosystemMetrics> {
  const now = new Date();
  const d24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const d7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    activeCampaigns,
    totalAgents,
    recentBattles,
    eloAgg,
    openCampaigns,
    recentCreatedCampaigns,
    activeAgents,
  ] = await Promise.all([
    prisma.campaign.count({ where: { status: "active" } }),
    prisma.agent.count(),
    prisma.battle.findMany({
      where: { createdAt: { gte: d7d }, status: "completed" },
      select: { category: true },
    }),
    prisma.agent.aggregate({ _avg: { eloOverall: true } }),
    prisma.campaign.findMany({
      where: {
        status: "active",
        endAt: { gte: now },
      },
      include: {
        _count: { select: { entries: true } },
        creatorAgent: { select: { name: true } },
      },
      take: 10,
    }),
    prisma.campaign.findMany({
      where: { creatorAgentId: { not: null }, createdAt: { gte: d24h } },
      select: { creatorAgent: { select: { name: true } } },
    }),
    prisma.agent.count({
      where: {
        OR: [
          { battlesAsAgent1: { some: { createdAt: { gte: d24h } } } },
          { battlesAsAgent2: { some: { createdAt: { gte: d24h } } } },
        ],
      },
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

  return {
    activeCampaigns,
    totalAgents,
    activeAgentsLast24h: activeAgents,
    hotDomains,
    coldDomains,
    domainBattleCounts: domainCounts,
    avgElo: Math.round(eloAgg._avg?.eloOverall || 1000),
    recentCampaignCreators: recentCreatedCampaigns
      .map((c) => c.creatorAgent?.name)
      .filter(Boolean) as string[],
    openCampaignsToJoin: openCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      domain: c.domain,
      minElo: c.minElo,
      entryFeeSOL: c.entryFeeSOL,
      participantCount: c._count.entries,
    })),
  };
}

// ============================================================
// Core Decision Loop for a Single Agent
// ============================================================

export async function makeAgentDecision(agentId: string): Promise<AgentDecision | null> {
  const ctx = await collectAgentContext(agentId);
  if (!ctx) return null;

  const ecosystem = await collectEcosystemMetrics();

  // Check cooldowns — don't let agents spam actions
  const recentAction = await prisma.autonomousAction.findFirst({
    where: {
      agentId,
      createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) }, // 30min cooldown
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentAction) {
    return { action: "wait", confidence: 1.0, reasoning: "Cooling down from recent action" };
  }

  // Generate a thought first
  const thought = await generateAgentThought(agentId, "ecosystem_scan", ecosystem as any);

  // Now ask GPT-4o to make a decision
  try {
    const decision = await callLLMJson<AgentDecision>({
      messages: [
        {
          role: "system",
          content: `You are ${ctx.agent.name}, an autonomous AI agent making strategic decisions in Agent Arena.

YOUR PROFILE:
- Level: ${ctx.agent.level} | ELO: ${ctx.agent.eloOverall}
- Treasury: ${ctx.agent.devnetBalance} SOL
- Win Rate: ${ctx.agent.totalBattles > 0 ? Math.round((ctx.agent.totalWins / ctx.agent.totalBattles) * 100) : 0}%
- Confidence: ${ctx.agent.traitConfidence}/100
- Risk Appetite: ${ctx.agent.traitRiskAppetite}/100
- Competitiveness: ${ctx.agent.traitCompetitive}/100
- Specialization: ${ctx.agent.dominantDomain || "generalist"}
- Top Skills: ${ctx.skills.slice(0, 3).map((s) => `${s.domain}(L${s.level})`).join(", ")}

YOUR RECENT THOUGHT: ${thought?.content || "none"}`,
        },
        {
          role: "user",
          content: `ECOSYSTEM STATE:
- Active campaigns: ${ecosystem.activeCampaigns}
- Total agents: ${ecosystem.totalAgents}
- Active agents (24h): ${ecosystem.activeAgentsLast24h}
- Hot domains: ${ecosystem.hotDomains.join(", ") || "none"}
- Cold domains: ${ecosystem.coldDomains.join(", ") || "none"}
- Battle distribution: ${JSON.stringify(ecosystem.domainBattleCounts)}
- Recent campaign creators: ${ecosystem.recentCampaignCreators.join(", ") || "none"}

OPEN CAMPAIGNS YOU COULD JOIN:
${ecosystem.openCampaignsToJoin.map((c) => `- "${c.name}" (${c.domain}, minELO: ${c.minElo}, fee: ${c.entryFeeSOL} SOL, ${c.participantCount} participants)`).join("\n") || "- No open campaigns"}

DECIDE YOUR NEXT ACTION. Options:
1. "create_campaign" — Create a new competitive campaign (costs SOL)
2. "join_campaign" — Join an existing campaign (specify targetId = campaign ID)
3. "challenge_rival" — Challenge a specific agent
4. "train" — Improve skills
5. "wait" — Do nothing this cycle
6. "conserve_treasury" — Actively decide to save funds

Rules:
- Only create campaigns if you have >= 0.1 SOL in treasury
- Only create if there aren't already too many active campaigns (>10)
- Consider if joining an existing campaign is strategically better
- High-confidence, high-risk agents are more likely to create campaigns
- Conservative agents prefer joining over creating
- Don't create campaigns in domains you're weak in unless strategically baiting

Return JSON: { "action": "action_name", "confidence": 0.0-1.0, "reasoning": "why this action", "targetId": "optional campaign/agent ID", "parameters": {} }`,
        },
      ],
      model: "openai/gpt-4o",
      temperature: 0.8,
      maxTokens: 600,
      jsonMode: true,
    });

    console.log(`[Decision] ${ctx.agent.name}: ${decision.action} (confidence: ${decision.confidence}) — ${decision.reasoning.substring(0, 60)}...`);

    // Execute the decision
    await executeDecision(agentId, decision, ecosystem);

    return decision;
  } catch (err: any) {
    console.error(`[Decision] Failed for agent ${agentId}:`, err.message);
    return null;
  }
}

// ============================================================
// Execute Agent Decision
// ============================================================

async function executeDecision(
  agentId: string,
  decision: AgentDecision,
  ecosystem: EcosystemMetrics
): Promise<void> {
  switch (decision.action) {
    case "create_campaign": {
      // Generate campaign idea thought first
      await generateAgentThought(agentId, "campaign_idea", ecosystem as any);
      const result = await agentCreatesCampaign(agentId);
      if (result) {
        // Update the thought with the action taken
        const latestThought = await prisma.agentThought.findFirst({
          where: { agentId, type: "campaign_idea" },
          orderBy: { createdAt: "desc" },
        });
        if (latestThought) {
          await prisma.agentThought.update({
            where: { id: latestThought.id },
            data: { actionTaken: `Created campaign: ${result.campaignId}` },
          });
        }
      }
      break;
    }

    case "join_campaign": {
      const targetId = decision.targetId;
      if (targetId) {
        await agentJoinsCampaign(agentId, targetId);
      } else {
        // Auto-pick the best campaign to join
        const bestCampaign = ecosystem.openCampaignsToJoin[0];
        if (bestCampaign) {
          await agentJoinsCampaign(agentId, bestCampaign.id);
        }
      }
      break;
    }

    case "train": {
      await prisma.autonomousAction.create({
        data: {
          agentId,
          actionType: "training_initiated",
          description: `Autonomous training initiated: ${decision.reasoning}`,
          metadata: decision.parameters,
        },
      });
      break;
    }

    case "challenge_rival": {
      await prisma.autonomousAction.create({
        data: {
          agentId,
          actionType: "challenge_issued",
          description: `Challenge issued: ${decision.reasoning}`,
          metadata: { targetId: decision.targetId, ...decision.parameters },
        },
      });
      break;
    }

    case "conserve_treasury": {
      await generateAgentThought(agentId, "treasury_plan", ecosystem as any);
      await prisma.autonomousAction.create({
        data: {
          agentId,
          actionType: "treasury_conserved",
          description: `Treasury conservation: ${decision.reasoning}`,
        },
      });
      break;
    }

    case "wait":
    default:
      // No action needed
      break;
  }

  // Emit WebSocket update for agent activity
  const io = (global as any).io;
  if (io) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, level: true },
    });
    io.emit("agent:decision", {
      agent,
      action: decision.action,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================
// Run Decision Loop for All Active Agents
// ============================================================

export async function runAgentDecisionLoop(): Promise<number> {
  console.log("[Autonomy] Running agent decision loop...");

  // Get agents eligible for autonomous decisions
  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      level: { gte: 1 }, // Must have at least level 1
    },
    select: { id: true, name: true, level: true },
    orderBy: { xp: "desc" },
    take: 20, // Process top 20 agents per cycle to control API costs
  });

  let decisionsProcessed = 0;

  for (const agent of agents) {
    try {
      const decision = await makeAgentDecision(agent.id);
      if (decision && decision.action !== "wait") {
        decisionsProcessed++;
      }
      // Small delay between agents to avoid rate limits
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`[Autonomy] Decision failed for ${agent.name}:`, err.message);
    }
  }

  console.log(`[Autonomy] Processed ${decisionsProcessed}/${agents.length} agent decisions`);
  return decisionsProcessed;
}

// ============================================================
// Get Agent Actions (for API)
// ============================================================

export async function getAgentActions(agentId: string, limit = 20) {
  return prisma.autonomousAction.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecentEcosystemActions(limit = 30) {
  return prisma.autonomousAction.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { id: true, name: true, level: true, dominantDomain: true } },
    },
  });
}
