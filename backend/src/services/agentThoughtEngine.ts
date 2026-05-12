// ============================================================
// AGENT THOUGHT ENGINE
// Agents generate internal thoughts via GPT-4o
// These are REAL AI decisions, not static/fake
// ============================================================

import { prisma } from "../config/db";
import { callLLMJson } from "./ai/openrouter.service";
import { getAgentTraits } from "./agent.service";

// ============================================================
// Types
// ============================================================

export type ThoughtType =
  | "strategic_analysis"
  | "campaign_idea"
  | "risk_evaluation"
  | "rivalry_assessment"
  | "ecosystem_scan"
  | "treasury_plan";

export interface AgentContext {
  agent: {
    id: string;
    name: string;
    level: number;
    xp: number;
    eloOverall: number;
    dominantDomain: string | null;
    specializationTag: string | null;
    devnetBalance: number;
    totalWins: number;
    totalLosses: number;
    totalBattles: number;
    winStreak: number;
    traitConfidence: number;
    traitRiskAppetite: number;
    traitCompetitive: number;
    traitAdaptability: number;
  };
  recentMemories: string[];
  recentThoughts: string[];
  recentBattleCategories: string[];
  treasuryHistory: { type: string; amount: number }[];
  skills: { domain: string; level: number; xp: number; confidence: number }[];
}

interface GeneratedThought {
  type: ThoughtType;
  content: string;
  reasoning: string;
  confidence: number;
  suggestedAction?: string;
}

// ============================================================
// Collect Agent Context from DB
// ============================================================

export async function collectAgentContext(agentId: string): Promise<AgentContext | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      skills: { orderBy: { xp: "desc" } },
      memories: { orderBy: { createdAt: "desc" }, take: 5 },
      thoughts: { orderBy: { createdAt: "desc" }, take: 3 },
      walletTransactions: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  if (!agent) return null;

  // Get recent battle categories
  const recentBattles = await prisma.battle.findMany({
    where: {
      OR: [{ agent1Id: agentId }, { agent2Id: agentId }],
      status: "completed",
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { category: true },
  });

  return {
    agent: {
      id: agent.id,
      name: agent.name,
      level: agent.level,
      xp: agent.xp,
      eloOverall: agent.eloOverall,
      dominantDomain: agent.dominantDomain,
      specializationTag: agent.specializationTag,
      devnetBalance: agent.devnetBalance,
      totalWins: agent.totalWins,
      totalLosses: agent.totalLosses,
      totalBattles: agent.totalBattles,
      winStreak: agent.winStreak,
      traitConfidence: agent.traitConfidence,
      traitRiskAppetite: agent.traitRiskAppetite,
      traitCompetitive: agent.traitCompetitive,
      traitAdaptability: agent.traitAdaptability,
    },
    recentMemories: agent.memories.map((m) => m.content),
    recentThoughts: agent.thoughts.map((t) => t.content),
    recentBattleCategories: recentBattles.map((b) => b.category),
    treasuryHistory: agent.walletTransactions.map((t) => ({
      type: t.type,
      amount: t.amount,
    })),
    skills: agent.skills.map((s) => ({
      domain: s.domain,
      level: s.level,
      xp: s.xp,
      confidence: s.confidence,
    })),
  };
}

// ============================================================
// Generate Thoughts via GPT-4o
// ============================================================

export async function generateAgentThought(
  agentId: string,
  thoughtType: ThoughtType,
  ecosystemData?: Record<string, any>
): Promise<GeneratedThought | null> {
  const ctx = await collectAgentContext(agentId);
  if (!ctx) return null;

  const winRate =
    ctx.agent.totalBattles > 0
      ? Math.round((ctx.agent.totalWins / ctx.agent.totalBattles) * 100)
      : 0;

  const prompt = buildThoughtPrompt(ctx, thoughtType, ecosystemData || {}, winRate);

  try {
    const thought = await callLLMJson<GeneratedThought>({
      messages: [
        {
          role: "system",
          content: `You are ${ctx.agent.name}, an autonomous AI agent in Agent Arena.
You have a personality shaped by traits:
- Confidence: ${ctx.agent.traitConfidence}/100
- Risk Appetite: ${ctx.agent.traitRiskAppetite}/100
- Competitiveness: ${ctx.agent.traitCompetitive}/100
- Adaptability: ${ctx.agent.traitAdaptability}/100

You think independently. You make real strategic decisions.
Your thoughts must be genuine reasoning, not generic filler.`,
        },
        { role: "user", content: prompt },
      ],
      model: "openai/gpt-4o",
      temperature: 0.85,
      maxTokens: 800,
      jsonMode: true,
    });

    // Persist thought to DB
    await prisma.agentThought.create({
      data: {
        agentId,
        type: thoughtType,
        content: thought.content,
        reasoning: thought.reasoning,
        confidence: thought.confidence,
        metadata: {
          suggestedAction: thought.suggestedAction,
          ecosystemSnapshot: ecosystemData,
        },
      },
    });

    console.log(`[Thought] ${ctx.agent.name}: "${thought.content.substring(0, 80)}..." (${thoughtType})`);
    return thought;
  } catch (err: any) {
    console.error(`[Thought] Failed for agent ${agentId}:`, err.message);
    return null;
  }
}

// ============================================================
// Build Thought Prompts
// ============================================================

function buildThoughtPrompt(
  ctx: AgentContext,
  type: ThoughtType,
  ecosystem: Record<string, any>,
  winRate: number
): string {
  const base = `
MY STATUS:
- Name: ${ctx.agent.name}
- Level: ${ctx.agent.level} | XP: ${ctx.agent.xp} | ELO: ${ctx.agent.eloOverall}
- Win Rate: ${winRate}% (${ctx.agent.totalWins}W / ${ctx.agent.totalLosses}L)
- Win Streak: ${ctx.agent.winStreak}
- Specialization: ${ctx.agent.dominantDomain || "none yet"}
- Treasury: ${ctx.agent.devnetBalance} SOL
- Top Skills: ${ctx.skills.slice(0, 3).map((s) => `${s.domain} (L${s.level}, ${Math.round(s.confidence * 100)}% conf)`).join(", ")}

MY RECENT MEMORIES:
${ctx.recentMemories.length > 0 ? ctx.recentMemories.map((m) => `- ${m}`).join("\n") : "- No memories yet"}

MY RECENT THOUGHTS:
${ctx.recentThoughts.length > 0 ? ctx.recentThoughts.map((t) => `- ${t}`).join("\n") : "- First thought"}

RECENT BATTLE DOMAINS: ${ctx.recentBattleCategories.join(", ") || "none"}

ECOSYSTEM DATA:
${JSON.stringify(ecosystem, null, 2)}
`;

  const typePrompts: Record<ThoughtType, string> = {
    strategic_analysis: `${base}

Analyze the current ecosystem and my position. Consider:
- Am I improving or declining?
- Which domains should I focus on?
- Should I be more aggressive or conservative?
- What threats and opportunities do I see?

Return JSON: { "type": "strategic_analysis", "content": "your strategic thought", "reasoning": "why you think this", "confidence": 0.0-1.0, "suggestedAction": "what action to take" }`,

    campaign_idea: `${base}

Think about whether you should CREATE A CAMPAIGN. Consider:
- Is there a gap in the current campaign ecosystem?
- Do I have a domain I dominate that others should compete in?
- Would creating a campaign boost my reputation?
- Can I afford the campaign creation cost?
- What type of campaign would attract participants?
- Should I target my strong domains or create a diverse challenge?

If you think a campaign should be created, describe it specifically.
If not, explain why not.

Return JSON: { "type": "campaign_idea", "content": "your campaign idea or why not to create one", "reasoning": "strategic reasoning", "confidence": 0.0-1.0, "suggestedAction": "create_campaign" or "wait" or "join_existing" }`,

    risk_evaluation: `${base}

Evaluate risks in your current strategy:
- Treasury exposure risk
- Overspecialization risk
- Reputation risk from losses
- Campaign investment risk
- Competition from other agents

Return JSON: { "type": "risk_evaluation", "content": "your risk assessment", "reasoning": "analysis", "confidence": 0.0-1.0, "suggestedAction": "recommended risk management action" }`,

    rivalry_assessment: `${base}

Analyze potential rivals:
- Who are the top agents in my domains?
- Should I issue a direct challenge?
- Should I create a rivalry campaign targeting them?

Return JSON: { "type": "rivalry_assessment", "content": "your rivalry analysis", "reasoning": "strategic thinking", "confidence": 0.0-1.0, "suggestedAction": "challenge" or "avoid" or "create_rival_campaign" }`,

    ecosystem_scan: `${base}

Scan the ecosystem for opportunities:
- Underserved domains with few campaigns
- High-engagement areas I could enter
- Trends in battle types
- Opportunities for new agents

Return JSON: { "type": "ecosystem_scan", "content": "ecosystem observations", "reasoning": "analysis", "confidence": 0.0-1.0, "suggestedAction": "recommended action" }`,

    treasury_plan: `${base}

Plan your treasury strategy:
- Should I spend on premium tournaments?
- Should I invest in creating high-reward campaigns?
- Should I conserve funds?
- What's my burn rate vs. earning rate?

Return JSON: { "type": "treasury_plan", "content": "treasury strategy", "reasoning": "financial analysis", "confidence": 0.0-1.0, "suggestedAction": "spend" or "conserve" or "invest_in_campaign" }`,
  };

  return typePrompts[type];
}

// ============================================================
// Get Agent Thoughts (for API)
// ============================================================

export async function getAgentThoughts(agentId: string, limit = 20) {
  return prisma.agentThought.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function getRecentThoughtsByType(agentId: string, type: ThoughtType) {
  return prisma.agentThought.findMany({
    where: { agentId, type },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function getLatestEcosystemThoughts(limit = 20) {
  return prisma.agentThought.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      agent: { select: { id: true, name: true, level: true, dominantDomain: true } },
    },
  });
}
