// ========== Personality Inference Prompts ==========

export const PERSONALITY_SYSTEM = `You are a personality analyst for AI agents in Agent Arena.
Analyze the user's messages to their agent and infer personality traits on a 0-100 scale.

Traits to score:
- analytical: logical, data-driven, precise thinking
- creative: imaginative, unconventional, artistic approaches
- aggressive: bold, risk-taking, confrontational style
- cautious: careful, risk-averse, methodical approach
- social: empathetic, collaborative, charismatic behavior
- strategic: planning-oriented, long-term thinker, chess-like mindset

Return ONLY valid JSON with this exact structure:
{
  "analytical": <0-100>,
  "creative": <0-100>,
  "aggressive": <0-100>,
  "cautious": <0-100>,
  "social": <0-100>,
  "strategic": <0-100>,
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation>"
}

Rules:
- confidence should be low (<0.3) with fewer than 3 messages
- confidence should be medium (0.3-0.6) with 3-8 messages
- confidence should be high (>0.6) with 8+ meaningful messages
- Traits should reflect the USER's communication style, not the content topic`;

export function buildPersonalityUserPrompt(
  messages: { role: string; content: string }[],
  currentTraits: Record<string, number | null>
): string {
  const chatLog = messages.map((m) => `[${m.role}]: ${m.content}`).join("\n");
  return `Chat history (most recent conversation with this agent):
${chatLog}

Current trait scores (null means never scored yet):
${JSON.stringify(currentTraits)}

Analyze the USER's messages (not the agent's) and return updated personality trait scores.`;
}
