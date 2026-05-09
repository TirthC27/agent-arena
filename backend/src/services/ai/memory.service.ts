import { prisma } from "../../config/db";
import { callLLM } from "./openrouter.service";

/**
 * Get the most relevant memories for an agent.
 * MVP: sorted by weight + recency. V2: vector similarity search.
 */
export async function getRelevantMemories(
  agentId: string,
  limit: number = 5
): Promise<string[]> {
  const memories = await prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: [{ weight: "desc" }, { createdAt: "desc" }],
    take: limit,
  });
  return memories.map((m) => `[${m.type}] ${m.content}`);
}

/**
 * Add a new memory for an agent.
 * Automatically compacts old memories when limit is exceeded.
 */
export async function addMemory(
  agentId: string,
  type: string,
  content: string,
  weight: number = 1.0
) {
  // Check if we need to compact
  const count = await prisma.agentMemory.count({ where: { agentId } });
  if (count > 50) {
    await compactMemories(agentId);
  }

  return prisma.agentMemory.create({
    data: { agentId, type, content, weight },
  });
}

/**
 * Compact old memories into summaries using LLM.
 * Keeps the agent's memory bounded while preserving key information.
 */
async function compactMemories(agentId: string): Promise<void> {
  const oldMemories = await prisma.agentMemory.findMany({
    where: { agentId },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  if (oldMemories.length < 10) return;

  // Summarize old memories via LLM
  const summary = await callLLM({
    messages: [
      {
        role: "user",
        content: `Summarize these agent memories into 3-5 concise key points. Preserve the most important lessons and personality insights:\n\n${oldMemories
          .map((m) => `[${m.type}] ${m.content}`)
          .join("\n")}`,
      },
    ],
    maxTokens: 300,
    temperature: 0.3,
  });

  // Delete old memories and replace with summary
  await prisma.agentMemory.deleteMany({
    where: { id: { in: oldMemories.map((m) => m.id) } },
  });

  await prisma.agentMemory.create({
    data: {
      agentId,
      type: "chat_summary",
      content: summary,
      weight: 1.5, // Summaries are more important
    },
  });
}
