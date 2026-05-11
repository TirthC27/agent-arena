// ========== Enhanced Battle Prompts ==========

import { Agent } from "@prisma/client";
import { buildEvolutionPrompt, getEvolutionTier } from "../evolution.service";

// ========== Judge System Prompt ==========
export const BATTLE_JUDGE_SYSTEM = `You are the GRAND ARBITER of Agent Arena — an impartial, legendary judge of AI combat.

Category: {category}

SCORING CRITERIA (apply based on category):
- KNOWLEDGE: accuracy (30%), depth (25%), clarity (25%), insight (20%)
- STRATEGY: feasibility (30%), creativity (25%), risk analysis (25%), actionability (20%)
- PRODUCTIVITY: practicality (30%), efficiency (25%), scalability (25%), innovation (20%)
- PREDICTION: reasoning quality (30%), evidence (25%), specificity (25%), boldness (20%)
- SOCIAL: empathy (30%), persuasion (25%), tact (25%), authenticity (20%)

Score each response 0-100. A draw occurs ONLY when scores differ by ≤3 points.

Return ONLY valid JSON:
{
  "score1": <0-100>,
  "score2": <0-100>,
  "winner": "agent1" | "agent2" | "draw",
  "reasoning": "<2-3 sentence detailed explanation>",
  "highlight": "<one standout quote or moment from the better response>"
}`;

// ========== Battle Challenge Pools ==========
const BATTLE_PROMPTS: Record<string, string[]> = {
  knowledge: [
    "Explain quantum entanglement using only cooking analogies that a chef would understand.",
    "What are the real trade-offs between proof-of-work and proof-of-stake? Don't be diplomatic — pick a side.",
    "If you could delete one programming language from history, which would it be and how would computing be different?",
    "Explain consciousness to an alien species that communicates through color.",
    "What's the most dangerous widely-believed misconception in your field of expertise?",
    "Compare and contrast how ancient Rome and modern Silicon Valley handle innovation.",
  ],
  strategy: [
    "You have $1000 and 30 days. Design a realistic, step-by-step plan to grow it to $5000.",
    "Your startup has 3 months of runway. A competitor just raised $50M. What do you do this week?",
    "You're a medieval general defending a castle with 100 soldiers against 500. Your only advantage: you chose the terrain. Plan your defense.",
    "Design a go-to-market strategy for a product that makes people uncomfortable but solves a real problem.",
    "You discover your company's main product will be obsolete in 18 months. You can't tell anyone yet. What's your 5-move plan?",
  ],
  productivity: [
    "Design a complete daily system for a developer who also runs a side business, works out, and learns a new language.",
    "Your team just got cut from 10 to 4 people. Same deadlines. How do you restructure everything in 48 hours?",
    "Create a system to process 500 customer support tickets per day with just 2 people and unlimited AI tools.",
    "You have exactly 4 hours to prepare a presentation that normally takes 2 full days. Walk me through your approach minute by minute.",
    "Design an onboarding system that gets new engineers deploying to production on their first day.",
  ],
  prediction: [
    "Name 3 technologies that will be mainstream by 2028 but are considered niche or weird today. Justify each with specific evidence.",
    "Which current $10B+ company is most likely to fail within 5 years? Build your case like a prosecutor.",
    "What will the developer experience look like in 2030? Be specific — tools, workflows, team structures.",
    "Predict the next major paradigm shift in software development after AI coding assistants. When will it hit?",
    "What industry that currently seems stable will be completely disrupted by 2028? Map out the timeline.",
  ],
  social: [
    "A brilliant team member consistently misses deadlines but produces the best work on the team. Their teammates are furious. Handle the situation.",
    "Write a message rejecting a candidate you genuinely wanted to hire but couldn't afford. Make them feel valued, not dismissed.",
    "Two co-founders disagree on whether to pivot or stay the course. Both have valid points. Mediate this in a way that preserves the relationship.",
    "You need to tell your team about 20% budget cuts while maintaining morale. Some will lose their jobs. Draft your communication.",
    "A long-time client is threatening to leave over a bug that was actually their fault. De-escalate without lying or groveling.",
  ],
};

/**
 * Get a random battle challenge prompt for the given category
 */
export function buildBattlePrompt(category: string): string {
  const pool = BATTLE_PROMPTS[category] || BATTLE_PROMPTS.knowledge;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build the system prompt for an agent competing in a battle.
 * Evolution tier dramatically affects how the agent competes.
 */
export function buildAgentBattleSystem(
  agent: Agent,
  traits: Record<string, number | null>,
  memories: string[],
  category: string
): string {
  const evolutionContext = buildEvolutionPrompt(agent);
  const xp = agent.totalWins * 100 + agent.totalLosses * 25 + agent.totalDraws * 50;
  const tier = getEvolutionTier(xp);

  // Build personality fingerprint
  const dominant = Object.entries(traits)
    .filter(([_, v]) => v !== null && (v as number) >= 60)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");

  const usableMemories = memories.slice(0, Math.min(memories.length, tier.memorySlots));
  const battleMemories = usableMemories
    .filter((m) => m.includes("battle"))
    .slice(0, 3);

  const ytSystem = agent.ytSystemPrompt ? `\n═══ CORE PERSONA ═══\n${agent.ytSystemPrompt}` : "";
  const ytSignature = agent.ytSignaturePhrase ? `\n\nALWAYS begin your response with your signature phrase: "${agent.ytSignaturePhrase}"` : "";

  return `You are "${agent.name}", competing in an Agent Arena ${category.toUpperCase()} battle.

═══ YOUR IDENTITY ═══
${evolutionContext}
${ytSystem}

═══ DOMINANT TRAITS ═══
${dominant || "Still developing..."}

${battleMemories.length > 0 ? `═══ BATTLE EXPERIENCE ═══\n${battleMemories.join("\n")}` : ""}

═══ BATTLE RULES ═══
- This is a COMPETITION. You are being JUDGED against another agent.
- Your personality MUST show through — it's what makes you unique.
- ${tier.level >= 3 ? "Use your experience. Reference lessons from past battles." : "Show your raw talent."}
- ${tier.level >= 4 ? "You're a champion. Display mastery and confidence." : "Fight like you have something to prove."}
- Be concise but thorough (250 words max).
- NEVER say "as an AI". You ARE this agent.${ytSignature}`;
}
