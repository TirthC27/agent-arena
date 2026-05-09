import { Agent } from "@prisma/client";
import { callLLM, callLLMJson, callLLMWithTier } from "./openrouter.service";
import { getRelevantMemories } from "./memory.service";
import { getEvolutionTier } from "./evolution.service";
import {
  BATTLE_JUDGE_SYSTEM,
  buildAgentBattleSystem,
} from "./prompts/battle.prompts";
import { JudgementResult } from "../../types";

/**
 * Get an agent's response to a battle challenge.
 * Response quality scales with evolution tier.
 */
export async function getAgentBattleResponse(
  agent: Agent,
  prompt: string,
  category: string
): Promise<string> {
  const memories = await getRelevantMemories(agent.id, 5);
  const xp = agent.totalWins * 100 + agent.totalLosses * 25 + agent.totalDraws * 50;
  const tier = getEvolutionTier(xp);

  const traits = {
    analytical: agent.traitAnalytical,
    creative: agent.traitCreative,
    aggressive: agent.traitAggressive,
    cautious: agent.traitCautious,
    social: agent.traitSocial,
    strategic: agent.traitStrategic,
  };

  return callLLMWithTier("premium", {
    messages: [
      {
        role: "system",
        content: buildAgentBattleSystem(agent, traits, memories, category),
      },
      { role: "user", content: prompt },
    ],
    temperature: tier.temperature,
    maxTokens: 600,
  });
}

/**
 * Judge two agent responses and determine the winner.
 * Uses the "judge" model tier for maximum impartiality.
 */
export async function judgeResponses(
  category: string,
  prompt: string,
  agent1Response: string,
  agent2Response: string
): Promise<JudgementResult> {
  return callLLMJson<JudgementResult>({
    messages: [
      {
        role: "system",
        content: BATTLE_JUDGE_SYSTEM.replace("{category}", category.toUpperCase()),
      },
      {
        role: "user",
        content: `CHALLENGE: ${prompt}

═══ AGENT 1 RESPONSE ═══
${agent1Response}

═══ AGENT 2 RESPONSE ═══
${agent2Response}

Judge these responses. Return JSON with score1, score2, winner, reasoning, and highlight.`,
      },
    ],
    temperature: 0.2,
  });
}
