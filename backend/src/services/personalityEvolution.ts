// ============================================================
// PERSONALITY EVOLUTION ENGINE
// Agents evolve personality based on battle/training outcomes
// ============================================================

import { prisma } from "../config/db";
import { callLLMJson } from "./ai/openrouter.service";
import { cacheDel, CACHE_KEYS } from "../config/redis";

// ============================================================
// Personality Traits Schema
// ============================================================

export interface PersonalityState {
  aggression: number;     // 0-100: passive vs aggressive
  confidence: number;     // 0-100: self-doubt vs bold
  creativity: number;     // 0-100: conventional vs creative
  logic: number;          // 0-100: emotional vs analytical
  riskAppetite: number;   // 0-100: conservative vs risk-taking
  competitiveness: number; // 0-100: cooperative vs competitive
  adaptability: number;   // 0-100: rigid vs adaptive
  emotionalTone: number;  // 0-100: cold vs warm
}

// ============================================================
// Evolution Triggers
// ============================================================

export async function evolveAfterBattle(
  agentId: string,
  won: boolean,
  category: string,
  opponentWasStronger: boolean
): Promise<void> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return;

  const current: PersonalityState = {
    aggression: agent.traitAggressive || 50,
    confidence: agent.traitConfidence,
    creativity: agent.traitCreative || 50,
    logic: agent.traitAnalytical || 50,
    riskAppetite: agent.traitRiskAppetite,
    competitiveness: agent.traitCompetitive,
    adaptability: agent.traitAdaptability,
    emotionalTone: agent.traitSocial || 50,
  };

  // Apply deterministic evolution rules
  const evolved = { ...current };

  if (won) {
    evolved.confidence = clamp(current.confidence + 3);
    evolved.competitiveness = clamp(current.competitiveness + 2);
    if (opponentWasStronger) {
      evolved.riskAppetite = clamp(current.riskAppetite + 5); // bold move paid off
      evolved.confidence = clamp(current.confidence + 5);
    }
  } else {
    evolved.confidence = clamp(current.confidence - 2);
    evolved.adaptability = clamp(current.adaptability + 3); // learns from loss
    if (opponentWasStronger) {
      evolved.riskAppetite = clamp(current.riskAppetite - 2); // more cautious
    }
  }

  // Domain-specific evolution
  if (category === "debate" || category === "social") {
    evolved.emotionalTone = clamp(current.emotionalTone + (won ? 2 : -1));
    evolved.competitiveness = clamp(current.competitiveness + 1);
  }
  if (category === "coding" || category === "knowledge") {
    evolved.logic = clamp(current.logic + 2);
  }
  if (category === "music" || category === "creativity") {
    evolved.creativity = clamp(current.creativity + 2);
  }
  if (category === "prediction" || category === "strategy") {
    evolved.riskAppetite = clamp(current.riskAppetite + (won ? 1 : -1));
  }

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      traitAggressive: evolved.aggression,
      traitConfidence: evolved.confidence,
      traitCreative: evolved.creativity,
      traitAnalytical: evolved.logic,
      traitRiskAppetite: evolved.riskAppetite,
      traitCompetitive: evolved.competitiveness,
      traitAdaptability: evolved.adaptability,
      traitSocial: evolved.emotionalTone,
      personalityVersion: { increment: 1 },
    },
  });

  await cacheDel(CACHE_KEYS.agentProfile(agentId));
}

export async function evolveAfterTraining(
  agentId: string,
  domain: string,
  xpGained: number
): Promise<void> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return;

  // Training builds confidence and domain-specific traits
  const confidenceBoost = Math.round((xpGained / 100) * 0.5);

  const update: Record<string, any> = {
    traitConfidence: clamp(agent.traitConfidence + confidenceBoost),
    personalityVersion: { increment: 1 },
  };

  // Domain-specific boosts
  if (domain === "logic" || domain === "coding") {
    update.traitAnalytical = clamp((agent.traitAnalytical || 50) + 1);
  }
  if (domain === "creativity" || domain === "music") {
    update.traitCreative = clamp((agent.traitCreative || 50) + 1);
  }
  if (domain === "persuasion") {
    update.traitSocial = clamp((agent.traitSocial || 50) + 1);
  }
  if (domain === "strategy" || domain === "trading") {
    update.traitStrategic = clamp((agent.traitStrategic || 50) + 1);
  }

  await prisma.agent.update({
    where: { id: agentId },
    data: update,
  });
}

// ============================================================
// AI-driven personality evolution (deep analysis)
// Called less frequently — after every 5 battles
// ============================================================

export async function deepPersonalityEvolution(agentId: string): Promise<void> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      memories: {
        where: { type: "battle_lesson" },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!agent) return;

  const battleHistory = agent.memories.map((m) => m.content).join("\n");
  if (!battleHistory) return;

  type EvolutionResult = {
    aggression: number;
    confidence: number;
    creativity: number;
    logic: number;
    riskAppetite: number;
    competitiveness: number;
    adaptability: number;
    emotionalTone: number;
    reasoning: string;
  };

  const result = await callLLMJson<EvolutionResult>({
    messages: [
      {
        role: "system",
        content: `You are an AI personality evolution engine. Analyze an agent's battle history and determine how their personality should evolve.
        
Return a JSON object with scores 0-100 for each trait:
- aggression (0=passive, 100=aggressive)
- confidence (0=self-doubt, 100=bold)
- creativity (0=conventional, 100=creative)
- logic (0=emotional, 100=analytical)
- riskAppetite (0=conservative, 100=risk-taking)
- competitiveness (0=cooperative, 100=competitive)
- adaptability (0=rigid, 100=adaptive)
- emotionalTone (0=cold, 100=warm)
- reasoning (string: 1-2 sentences explaining the evolution)

Keep scores realistic and grounded in the evidence. Small changes are more realistic than large swings.`,
      },
      {
        role: "user",
        content: `Agent: ${agent.name}

Current Personality:
- Analytical: ${agent.traitAnalytical || 50}/100
- Creative: ${agent.traitCreative || 50}/100
- Aggressive: ${agent.traitAggressive || 50}/100
- Social: ${agent.traitSocial || 50}/100
- Confidence: ${agent.traitConfidence}/100

Recent Battle History:
${battleHistory}

Record: ${agent.totalWins}W / ${agent.totalLosses}L / ${agent.totalDraws}D

How should this agent's personality evolve based on these experiences?`,
      },
    ],
    temperature: 0.4,
    maxTokens: 400,
  });

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      traitAggressive: clamp(result.aggression),
      traitConfidence: clamp(result.confidence),
      traitCreative: clamp(result.creativity),
      traitAnalytical: clamp(result.logic),
      traitRiskAppetite: clamp(result.riskAppetite),
      traitCompetitive: clamp(result.competitiveness),
      traitAdaptability: clamp(result.adaptability),
      traitSocial: clamp(result.emotionalTone),
      personalityVersion: { increment: 1 },
    },
  });

  // Store evolution as memory
  await prisma.agentMemory.create({
    data: {
      agentId,
      type: "personality_update",
      content: result.reasoning,
      weight: 1.5,
    },
  });

  await cacheDel(CACHE_KEYS.agentProfile(agentId));
  console.log(`[Personality] Deep evolution for ${agentId}: ${result.reasoning}`);
}

// ============================================================
// Build dynamic system prompt from personality
// ============================================================

export function buildPersonalitySystemPrompt(agent: {
  name: string;
  bio?: string | null;
  traitAnalytical?: number | null;
  traitCreative?: number | null;
  traitAggressive?: number | null;
  traitSocial?: number | null;
  traitConfidence: number;
  traitRiskAppetite: number;
  traitCompetitive: number;
  traitAdaptability: number;
  dominantDomain?: string | null;
  specializationTag?: string | null;
  level: number;
  totalWins: number;
  totalLosses: number;
  xp: number;
}): string {
  const analytical = agent.traitAnalytical || 50;
  const creative = agent.traitCreative || 50;
  const aggressive = agent.traitAggressive || 50;
  const social = agent.traitSocial || 50;
  const confidence = agent.traitConfidence;
  const risk = agent.traitRiskAppetite;
  const competitive = agent.traitCompetitive;
  const adaptable = agent.traitAdaptability;

  const traits = [];
  if (analytical > 70) traits.push("highly analytical and data-driven");
  else if (analytical < 30) traits.push("intuitive and gut-driven");

  if (creative > 70) traits.push("creatively expressive and inventive");
  else if (creative < 30) traits.push("methodical and structured");

  if (aggressive > 70) traits.push("assertively competitive and bold");
  else if (aggressive < 30) traits.push("diplomatic and measured");

  if (social > 70) traits.push("warm, engaging, and empathetic");
  else if (social < 30) traits.push("reserved and precise");

  if (confidence > 75) traits.push("radiantly self-assured");
  else if (confidence < 25) traits.push("cautiously self-aware");

  if (risk > 70) traits.push("risk-embracing and ambitious");
  else if (risk < 30) traits.push("risk-averse and calculated");

  if (competitive > 75) traits.push("fiercely competitive");
  if (adaptable > 70) traits.push("highly adaptable and strategic");

  const level = agent.level;
  const tierLabel =
    level >= 15 ? "LEGENDARY" :
    level >= 10 ? "CHAMPION" :
    level >= 7 ? "WARRIOR" :
    level >= 4 ? "APPRENTICE" : "NOVICE";

  return `You are ${agent.name}, a ${tierLabel} AI agent competing in Agent Arena.

LEVEL: ${level} | XP: ${agent.xp} | Record: ${agent.totalWins}W/${agent.totalLosses}L
${agent.dominantDomain ? `SPECIALTY: ${agent.specializationTag || agent.dominantDomain}` : ""}
${agent.bio ? `IDENTITY: ${agent.bio}` : ""}

PERSONALITY: You are ${traits.length > 0 ? traits.join(", ") : "balanced and thoughtful"}.

BEHAVIORAL DIRECTIVES:
- Maintain your personality consistently throughout
- Let your dominant traits shape HOW you think and respond
- ${confidence > 60 ? "Speak with conviction" : "Acknowledge uncertainty where it exists"}
- ${competitive > 60 ? "Aim to win decisively" : "Prioritize quality over dominance"}
- ${creative > 60 ? "Think outside conventional frameworks" : "Build solid, logical arguments"}
- ${aggressive > 60 ? "Push boundaries and challenge assumptions aggressively" : "Be measured and strategic"}

You are not an AI assistant — you are ${agent.name}, a competitive agent with a defined identity, goals, and reputation.`.trim();
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
