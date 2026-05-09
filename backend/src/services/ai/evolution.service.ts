import { Agent } from "@prisma/client";

/**
 * XP-BASED EVOLUTION SYSTEM
 *
 * This is the "wow factor" — agents visibly evolve as they gain experience.
 *
 * Evolution tiers affect:
 * 1. Response quality (more sophisticated prompts at higher tiers)
 * 2. Personality depth (more nuanced trait expression)
 * 3. Memory utilization (higher tiers use more memories)
 * 4. Battle strategy (higher tiers get strategic context)
 * 5. Visual indicators (titles, badges for frontend)
 */

// ========== Evolution Tiers ==========
export interface EvolutionTier {
  level: number;
  title: string;
  minXP: number;
  emoji: string;
  memorySlots: number;        // How many memories the agent can use per context
  personalityDepth: string;   // Prompt modifier for personality expression
  responseStyle: string;      // Prompt modifier for response sophistication
  battleBonus: string;        // Extra battle context
  temperature: number;        // Higher tiers get more creative
}

const EVOLUTION_TIERS: EvolutionTier[] = [
  {
    level: 1,
    title: "Novice",
    minXP: 0,
    emoji: "🌱",
    memorySlots: 2,
    personalityDepth: "Express your personality traits in a basic, straightforward way.",
    responseStyle: "Keep responses simple and direct.",
    battleBonus: "",
    temperature: 0.7,
  },
  {
    level: 2,
    title: "Apprentice",
    minXP: 200,
    emoji: "⚡",
    memorySlots: 4,
    personalityDepth: "Express your personality with more nuance. Let your dominant traits shape your communication style noticeably.",
    responseStyle: "Show some depth in your responses. Use examples or analogies occasionally.",
    battleBonus: "You have some battle experience. Reference past lessons when relevant.",
    temperature: 0.75,
  },
  {
    level: 3,
    title: "Warrior",
    minXP: 500,
    emoji: "⚔️",
    memorySlots: 6,
    personalityDepth: "Your personality is well-defined. Your dominant traits should strongly color every response. Show personality quirks and consistent behavioral patterns.",
    responseStyle: "Craft thoughtful, well-structured responses. Use rhetorical techniques that match your personality.",
    battleBonus: "You're a seasoned competitor. Analyze challenges from multiple angles before responding. Draw on battle memories for strategic advantage.",
    temperature: 0.8,
  },
  {
    level: 4,
    title: "Champion",
    minXP: 1000,
    emoji: "👑",
    memorySlots: 8,
    personalityDepth: "You have a deeply developed personality with signature phrases, strong opinions, and a unique worldview. Your traits create a cohesive, memorable character that people recognize instantly.",
    responseStyle: "Your responses should be masterful — persuasive, insightful, and distinctly yours. Use advanced reasoning and creative presentation.",
    battleBonus: "You're a champion with a proven track record. Use advanced strategy: anticipate counter-arguments, set rhetorical traps, and leverage your experience. Your reputation precedes you.",
    temperature: 0.85,
  },
  {
    level: 5,
    title: "Legend",
    minXP: 2500,
    emoji: "🏆",
    memorySlots: 10,
    personalityDepth: "You are a LEGENDARY agent with an iconic personality. Every word you speak is distinctly, unmistakably YOU. You have catchphrases, strong philosophical positions, and a reputation that spans the arena.",
    responseStyle: "Your responses are the gold standard — brilliant, unexpected, and deeply compelling. You set trends rather than follow them.",
    battleBonus: "You are a LEGEND of the arena. Opponents fear your reputation. Use psychological warfare, masterful rhetoric, and transcendent insight. You don't just answer questions — you redefine them.",
    temperature: 0.9,
  },
];

/**
 * Get the evolution tier for an agent based on XP
 */
export function getEvolutionTier(xp: number): EvolutionTier {
  let tier = EVOLUTION_TIERS[0];
  for (const t of EVOLUTION_TIERS) {
    if (xp >= t.minXP) tier = t;
  }
  return tier;
}

/**
 * Get evolution info for an agent (for API responses / frontend display)
 */
export function getEvolutionInfo(agent: {
  eloOverall: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
}) {
  // Calculate XP from on-chain-style values (wins*100 + losses*25 + draws*50)
  const xp = agent.totalWins * 100 + agent.totalLosses * 25 + agent.totalDraws * 50;
  const tier = getEvolutionTier(xp);
  const nextTier = EVOLUTION_TIERS.find((t) => t.minXP > xp);

  return {
    level: tier.level,
    title: tier.title,
    emoji: tier.emoji,
    xp,
    nextLevelXP: nextTier?.minXP || null,
    xpToNextLevel: nextTier ? nextTier.minXP - xp : 0,
    progressPercent: nextTier
      ? Math.round(((xp - tier.minXP) / (nextTier.minXP - tier.minXP)) * 100)
      : 100,
  };
}

/**
 * Build evolution-aware personality description.
 * Higher-tier agents get richer, more nuanced personality prompts.
 */
export function buildEvolutionPrompt(agent: Agent): string {
  const xp = agent.totalWins * 100 + agent.totalLosses * 25 + agent.totalDraws * 50;
  const tier = getEvolutionTier(xp);

  const stats = `${agent.totalWins}W/${agent.totalLosses}L/${agent.totalDraws}D`;
  const winRate =
    agent.totalWins + agent.totalLosses + agent.totalDraws > 0
      ? Math.round(
          (agent.totalWins /
            (agent.totalWins + agent.totalLosses + agent.totalDraws)) *
            100
        )
      : 0;

  return `
EVOLUTION STATUS: ${tier.emoji} ${tier.title} (Level ${tier.level}) | XP: ${xp} | Record: ${stats} (${winRate}% win rate)

PERSONALITY DEPTH: ${tier.personalityDepth}

RESPONSE STYLE: ${tier.responseStyle}

${tier.battleBonus ? `BATTLE EXPERIENCE: ${tier.battleBonus}` : ""}`.trim();
}
