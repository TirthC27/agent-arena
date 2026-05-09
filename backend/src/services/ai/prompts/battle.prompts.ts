// ========== Battle Prompts ==========

export const BATTLE_JUDGE_SYSTEM = `You are the impartial judge of Agent Arena battles.
Category: {category}

Evaluate both agent responses to the challenge prompt.
Score each response from 0 to 100 based on:
- Relevance and accuracy (30%)
- Creativity and originality (25%)
- Depth and thoroughness (25%)
- Communication clarity (20%)

Return ONLY valid JSON:
{
  "score1": <0-100>,
  "score2": <0-100>,
  "winner": "agent1" | "agent2" | "draw",
  "reasoning": "<detailed explanation of scoring>"
}

A draw occurs only when scores are within 3 points of each other.`;

const BATTLE_PROMPTS: Record<string, string[]> = {
  knowledge: [
    "Explain quantum computing to someone who only understands cooking analogies.",
    "What are the real trade-offs between proof-of-work and proof-of-stake consensus?",
    "Compare microservices vs monolith architecture — when would you choose each?",
    "Explain how a neural network learns, using only concepts from everyday life.",
    "What would happen to the global economy if all debt was instantly forgiven?",
  ],
  strategy: [
    "You have $1000 and 30 days. Design a realistic plan to grow it to $5000.",
    "Your startup has 3 months of runway left. Prioritize: hiring, product development, or fundraising. Justify.",
    "Design a go-to-market strategy for a new AI-powered code review tool.",
    "You're defending a castle with 100 soldiers against 500 attackers. What's your strategy?",
    "A competitor just launched your product for free. What do you do in the next 48 hours?",
  ],
  productivity: [
    "Design a daily system for a developer who also runs a side business and has 2 kids.",
    "Create a workflow to process 500 customer support tickets per day with just 2 people.",
    "You have 4 hours to prepare a presentation that normally takes 2 days. How?",
    "Design an onboarding process that gets new engineers shipping code on day 1.",
  ],
  prediction: [
    "Name 3 technologies that will be mainstream by 2028 but are niche today. Justify each.",
    "Which current $10B+ company is most likely to fail in 5 years? Build your case.",
    "Predict how remote work will evolve in the next 3 years with specific milestones.",
    "What will be the next major paradigm shift in software development after AI coding assistants?",
  ],
  social: [
    "A brilliant team member consistently misses deadlines but produces the best work. How do you handle this?",
    "Write a message rejecting a strong candidate you really wanted to hire but can't afford.",
    "Two cofounders disagree on a critical product direction. Mediate the situation.",
    "You need to deliver bad news to your team: 20% budget cuts. Craft your communication.",
    "A client is furious about a bug that cost them money. De-escalate and retain them.",
  ],
};

/**
 * Get a random battle prompt for the given category
 */
export function buildBattlePrompt(category: string): string {
  const pool = BATTLE_PROMPTS[category] || BATTLE_PROMPTS.knowledge;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build the system prompt for an agent responding to a battle challenge
 */
export function buildAgentBattleSystem(
  agentName: string,
  traits: Record<string, number | null>,
  memories: string[],
  category: string
): string {
  return `You are ${agentName}, an AI agent competing in Agent Arena.
Your personality traits (0-100): ${JSON.stringify(traits)}
Your relevant past experiences: ${memories.length > 0 ? memories.join("; ") : "No prior battle experience."}

You are in a ${category.toUpperCase()} battle. Respond to the challenge IN CHARACTER.
Your personality should clearly influence your response style.
Be concise but thorough (max 300 words).`;
}
