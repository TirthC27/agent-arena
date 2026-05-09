import { prisma } from "../config/db";
import { callLLM } from "./ai/openrouter.service";
import { getRelevantMemories } from "./ai/memory.service";
import { inferPersonality } from "./ai/personality.service";
import { buildAgentChatSystem } from "./ai/prompts/chat.prompts";
import { getEvolutionTier, getEvolutionInfo } from "./ai/evolution.service";
import { ApiError } from "../utils/ApiError";

/**
 * Send a message to an agent and get a response.
 * Triggers personality inference every 3 user messages.
 */
export async function sendMessage(
  agentId: string,
  userId: string,
  content: string
) {
  // Verify the agent belongs to this user
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  // 1. Save user message
  await prisma.chatMessage.create({
    data: { agentId, role: "user", content },
  });

  // 2. Get context for the response
  const history = await prisma.chatMessage.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  const memories = await getRelevantMemories(agentId, 5);

  const traits = {
    analytical: agent.traitAnalytical,
    creative: agent.traitCreative,
    aggressive: agent.traitAggressive,
    cautious: agent.traitCautious,
    social: agent.traitSocial,
    strategic: agent.traitStrategic,
  };

  // 3. Build evolution-aware system prompt
  const systemPrompt = buildAgentChatSystem(agent, traits, memories);
  const xp = agent.totalWins * 100 + agent.totalLosses * 25 + agent.totalDraws * 50;
  const tier = getEvolutionTier(xp);

  // 4. Call LLM with tier-appropriate temperature
  const reply = await callLLM({
    messages: [
      { role: "system", content: systemPrompt },
      ...history.reverse().map((m) => ({
        role: m.role as string,
        content: m.content,
      })),
    ],
    temperature: tier.temperature,
  });

  // 5. Save agent reply
  await prisma.chatMessage.create({
    data: { agentId, role: "agent", content: reply },
  });

  // 6. Trigger personality inference every 3 user messages
  const userMsgCount = await prisma.chatMessage.count({
    where: { agentId, role: "user" },
  });

  let personalityUpdate = null;
  if (userMsgCount % 3 === 0 && userMsgCount > 0) {
    // Fire and forget — don't block the chat response
    inferPersonality(agentId)
      .then((result) => {
        console.log(
          `[PERSONALITY] Updated ${agent.name} (confidence: ${result.confidence})`
        );
      })
      .catch((err) => {
        console.error(`[PERSONALITY] Failed for ${agent.name}:`, err.message);
      });
    personalityUpdate = "Personality analysis triggered";
  }

  return { reply, personalityUpdate, evolution: getEvolutionInfo(agent) };
}

/**
 * Get chat history for an agent
 */
export async function getChatHistory(
  agentId: string,
  userId: string,
  limit: number = 50
) {
  // Verify ownership
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  return prisma.chatMessage.findMany({
    where: { agentId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
