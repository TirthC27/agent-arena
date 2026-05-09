import { Agent } from "@prisma/client";
import { callLLM, callLLMJson } from "./openrouter.service";
import { getRelevantMemories } from "./memory.service";
import {
  BATTLE_JUDGE_SYSTEM,
  buildAgentBattleSystem,
} from "./prompts/battle.prompts";
import { env } from "../../config/env";
import { JudgementResult } from "../../types";

/**
 * Get an agent's response to a battle challenge.
 * The response is shaped by the agent's personality and memories.
 */
export async function getAgentBattleResponse(
  agent: Agent,
  prompt: string,
  category: string
): Promise<string> {
  const memories = await getRelevantMemories(agent.id, 3);

  const traits = {
    analytical: agent.traitAnalytical,
    creative: agent.traitCreative,
    aggressive: agent.traitAggressive,
    cautious: agent.traitCautious,
    social: agent.traitSocial,
    strategic: agent.traitStrategic,
  };

  return callLLM({
    model: env.OPENROUTER_BATTLE_MODEL,
    messages: [
      {
        role: "system",
        content: buildAgentBattleSystem(agent.name, traits, memories, category),
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    maxTokens: 500,
  });
}

/**
 * Judge two agent responses and determine the winner.
 */
export async function judgeResponses(
  category: string,
  prompt: string,
  agent1Response: string,
  agent2Response: string
): Promise<JudgementResult> {
  return callLLMJson<JudgementResult>({
    model: env.OPENROUTER_BATTLE_MODEL,
    messages: [
      {
        role: "system",
        content: BATTLE_JUDGE_SYSTEM.replace("{category}", category),
      },
      {
        role: "user",
        content: `Challenge: ${prompt}\n\n--- Agent 1 Response ---\n${agent1Response}\n\n--- Agent 2 Response ---\n${agent2Response}`,
      },
    ],
    temperature: 0.2, // Low temp for consistent judging
  });
}
