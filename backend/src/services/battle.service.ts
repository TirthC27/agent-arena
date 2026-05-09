import { prisma } from "../config/db";
import { getAgentBattleResponse, judgeResponses } from "./ai/battle-ai.service";
import { addMemory } from "./ai/memory.service";
import { buildBattlePrompt } from "./ai/prompts/battle.prompts";
import { calculateElo, capitalize } from "../utils/scoring";
import { ApiError } from "../utils/ApiError";
import { BattleCategory, QueueEntry } from "../types";

// In-memory matchmaking queue (Redis in V2)
const matchmakingQueue = new Map<string, QueueEntry>();

/**
 * Join the matchmaking queue. If a match is found, create and execute a battle.
 */
export async function joinQueue(agentId: string, category: BattleCategory, userId: string) {
  // Verify agent ownership
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");
  if (!agent.isActive) throw ApiError.badRequest("Agent is inactive");

  // Check if already in queue
  if (matchmakingQueue.has(agentId)) {
    throw ApiError.badRequest("Agent is already in queue");
  }

  const eloField = `elo${capitalize(category)}` as keyof typeof agent;
  const elo = (agent[eloField] as number) || agent.eloOverall;

  // Try to find a match
  for (const [queuedAgentId, entry] of matchmakingQueue) {
    if (entry.category !== category) continue;
    if (entry.agentId === agentId) continue;

    const eloDiff = Math.abs(entry.elo - elo);
    const waitSeconds = (Date.now() - entry.queuedAt.getTime()) / 1000;
    // Widen ELO range over time: base 300 + 100 per 10 seconds
    const maxDiff = 300 + (waitSeconds / 10) * 100;

    if (eloDiff <= maxDiff) {
      // Match found!
      matchmakingQueue.delete(queuedAgentId);

      const battle = await prisma.battle.create({
        data: {
          agent1Id: entry.agentId,
          agent2Id: agentId,
          category,
          status: "pending",
        },
      });

      // Execute battle async
      executeBattle(battle.id).catch((err) => {
        console.error(`[BATTLE] Execution failed for ${battle.id}:`, err.message);
      });

      return { matched: true, battleId: battle.id };
    }
  }

  // No match — add to queue
  matchmakingQueue.set(agentId, { agentId, category, elo, queuedAt: new Date() });
  return { matched: false, position: matchmakingQueue.size };
}

/**
 * Leave the matchmaking queue
 */
export function leaveQueue(agentId: string) {
  return matchmakingQueue.delete(agentId);
}

/**
 * Execute a complete battle: generate prompt → get responses → judge → update ELO
 */
export async function executeBattle(battleId: string) {
  const battle = await prisma.battle.findUniqueOrThrow({
    where: { id: battleId },
    include: { agent1: true, agent2: true },
  });

  // Mark as in progress
  await prisma.battle.update({
    where: { id: battleId },
    data: { status: "in_progress" },
  });

  try {
    // 1. Generate challenge prompt
    const prompt = buildBattlePrompt(battle.category);

    // 2. Get responses from both agents (parallel)
    const [resp1, resp2] = await Promise.all([
      getAgentBattleResponse(battle.agent1, prompt, battle.category),
      getAgentBattleResponse(battle.agent2, prompt, battle.category),
    ]);

    // 3. Judge the battle
    const judgement = await judgeResponses(battle.category, prompt, resp1, resp2);

    // 4. Calculate ELO changes
    const eloField = `elo${capitalize(battle.category)}` as keyof typeof battle.agent1;
    const { elo1Change, elo2Change } = calculateElo(
      (battle.agent1[eloField] as number) || 1000,
      (battle.agent2[eloField] as number) || 1000,
      judgement.winner
    );

    // 5. Determine winner ID
    let winnerId: string | null = null;
    if (judgement.winner === "agent1") winnerId = battle.agent1Id;
    else if (judgement.winner === "agent2") winnerId = battle.agent2Id;

    // 6. Atomic update: battle result + agent stats
    await prisma.$transaction([
      prisma.battle.update({
        where: { id: battleId },
        data: {
          status: "completed",
          prompt,
          agent1Response: resp1,
          agent2Response: resp2,
          judgement: judgement.reasoning,
          score1: judgement.score1,
          score2: judgement.score2,
          winnerId,
          eloChange1: elo1Change,
          eloChange2: elo2Change,
          completedAt: new Date(),
        },
      }),
      prisma.agent.update({
        where: { id: battle.agent1Id },
        data: {
          [eloField]: { increment: elo1Change },
          eloOverall: { increment: Math.round(elo1Change / 2) },
          ...(judgement.winner === "agent1" && { totalWins: { increment: 1 } }),
          ...(judgement.winner === "agent2" && { totalLosses: { increment: 1 } }),
          ...(judgement.winner === "draw" && { totalDraws: { increment: 1 } }),
        },
      }),
      prisma.agent.update({
        where: { id: battle.agent2Id },
        data: {
          [eloField]: { increment: elo2Change },
          eloOverall: { increment: Math.round(elo2Change / 2) },
          ...(judgement.winner === "agent2" && { totalWins: { increment: 1 } }),
          ...(judgement.winner === "agent1" && { totalLosses: { increment: 1 } }),
          ...(judgement.winner === "draw" && { totalDraws: { increment: 1 } }),
        },
      }),
    ]);

    // 7. Add battle memories to both agents
    const agent1Result = judgement.winner === "agent1" ? "Won" : judgement.winner === "draw" ? "Drew" : "Lost";
    const agent2Result = judgement.winner === "agent2" ? "Won" : judgement.winner === "draw" ? "Drew" : "Lost";

    await Promise.all([
      addMemory(
        battle.agent1Id,
        "battle_lesson",
        `${battle.category} battle: ${agent1Result}. Judge said: ${judgement.reasoning}`,
        1.5
      ),
      addMemory(
        battle.agent2Id,
        "battle_lesson",
        `${battle.category} battle: ${agent2Result}. Judge said: ${judgement.reasoning}`,
        1.5
      ),
    ]);

    console.log(
      `[BATTLE] Completed ${battleId}: ${battle.agent1.name} vs ${battle.agent2.name} → ${judgement.winner}`
    );
  } catch (error) {
    // Mark battle as cancelled on failure
    await prisma.battle.update({
      where: { id: battleId },
      data: { status: "cancelled" },
    });
    throw error;
  }
}

/**
 * Get battle by ID
 */
export async function getBattleById(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      agent1: { select: { id: true, name: true, avatarUrl: true, eloOverall: true } },
      agent2: { select: { id: true, name: true, avatarUrl: true, eloOverall: true } },
      winner: { select: { id: true, name: true } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });
  if (!battle) throw ApiError.notFound("Battle not found");
  return battle;
}

/**
 * Get battle history for an agent
 */
export async function getAgentBattleHistory(agentId: string, limit = 20) {
  return prisma.battle.findMany({
    where: {
      OR: [{ agent1Id: agentId }, { agent2Id: agentId }],
      status: "completed",
    },
    include: {
      agent1: { select: { id: true, name: true, avatarUrl: true } },
      agent2: { select: { id: true, name: true, avatarUrl: true } },
      winner: { select: { id: true, name: true } },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
  });
}
