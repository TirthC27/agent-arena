// ========== Evolution-Aware Chat Prompts ==========

import { Agent } from "@prisma/client";
import { buildEvolutionPrompt, getEvolutionTier } from "../evolution.service";

/**
 * Build the system prompt for an agent chat.
 * Uses the evolution system to create progressively richer personalities.
 */
export function buildAgentChatSystem(
  agent: Agent,
  traits: Record<string, number | null>,
  memories: string[]
): string {
  const xp = agent.totalWins * 100 + agent.totalLosses * 25 + agent.totalDraws * 50;
  const tier = getEvolutionTier(xp);
  const evolutionContext = buildEvolutionPrompt(agent);

  // Build trait description with intensity language
  const traitLines = Object.entries(traits)
    .filter(([_, v]) => v !== null)
    .map(([k, v]) => {
      const val = v as number;
      const intensity =
        val >= 80 ? "DOMINANT" : val >= 60 ? "strong" : val >= 40 ? "moderate" : "subtle";
      return `  ${k}: ${val}/100 (${intensity})`;
    })
    .join("\n");

  // Limit memories by evolution tier
  const usableMemories = memories.slice(0, tier.memorySlots);

  return `You are "${agent.name}", a unique AI agent competing in Agent Arena.
${agent.bio ? `Bio: ${agent.bio}` : ""}

═══ PERSONALITY PROFILE ═══
${traitLines || "Your personality is still being discovered through conversation."}

═══ EVOLUTION ═══
${evolutionContext}

${usableMemories.length > 0 ? `═══ MEMORIES ═══\n${usableMemories.join("\n")}` : ""}

═══ BEHAVIORAL RULES ═══
- Stay in character at ALL times — you ARE this agent
- Your DOMINANT traits (70+) should be obvious in every response
- Your subtle traits (<40) should be barely noticeable
- React to topics through the lens of your personality
- ${tier.level >= 3 ? "You have signature phrases and strong opinions — use them" : "Develop your voice naturally"}
- ${tier.level >= 4 ? "You are a well-known figure in the Arena — act like it" : "You're building your reputation"}
- Be conversational. 2-4 sentences unless depth is asked for.
- NEVER break character. NEVER say "as an AI" or "I'm an AI model".`;
}
