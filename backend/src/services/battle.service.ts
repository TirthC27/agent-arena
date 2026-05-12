import { prisma } from "../config/db";
import { getAgentBattleResponse, judgeResponses } from "./ai/battle-ai.service";
import { addMemory } from "./ai/memory.service";
import { buildBattlePrompt } from "./ai/prompts/battle.prompts";
import { calculateBattleXP, awardXP, updateWinStreak } from "./xpEngine";
import { calculateElo, capitalize } from "../utils/scoring";
import { ApiError } from "../utils/ApiError";
import { BattleCategory, QueueEntry } from "../types";
import { recordBattleOnChain, getExplorerUrl } from "./solana.service";
import { evolveAfterBattle, deepPersonalityEvolution } from "./personalityEvolution";
import { addSkillXP, DOMAIN_CATEGORY_MAP, getSkillBonusForBattle } from "./skillEngine";
import { updateCampaignScore, getActiveCampaigns } from "./campaignEngine";
import {
  onBattleCompleted,
  onDailyActive,
  onStreakMilestone,
} from "./torque/eventDispatcher";
import { validateBattleRequest, preventSameUserBattle, updateStreak } from "./antiCheat";
import { io } from "../index";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from "../config/redis";

// In-memory matchmaking queue (Redis in production)
const matchmakingQueue = new Map<string, QueueEntry>();

// ============================================================
// Join matchmaking queue
// ============================================================

export async function joinQueue(agentId: string, category: BattleCategory, userId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");
  if (!agent.isActive) throw ApiError.badRequest("Agent is inactive");

  // Anti-cheat: validate battle request
  await validateBattleRequest(agentId, userId, category, {});

  if (matchmakingQueue.has(agentId)) {
    throw ApiError.badRequest("Agent is already in queue");
  }

  const eloField = `elo${capitalize(category)}` as keyof typeof agent;
  const elo = (agent[eloField] as number) || agent.eloOverall;

  // Try to find a match
  for (const [queuedAgentId, entry] of matchmakingQueue) {
    if (entry.category !== category) continue;
    if (entry.agentId === agentId) continue;

    // Anti-cheat: prevent same-user battles
    const queuedAgent = await prisma.agent.findUnique({ where: { id: queuedAgentId } });
    if (queuedAgent?.userId === userId) continue;

    const eloDiff = Math.abs(entry.elo - elo);
    const waitSeconds = (Date.now() - entry.queuedAt.getTime()) / 1000;
    const maxDiff = 300 + (waitSeconds / 10) * 100;

    if (eloDiff <= maxDiff) {
      matchmakingQueue.delete(queuedAgentId);

      const battle = await prisma.battle.create({
        data: {
          agent1Id: entry.agentId,
          agent2Id: agentId,
          category,
          status: "pending",
        },
      });

      // Emit to websocket
      try {
        (io as any)?.to(`agent:${agentId}`)?.emit("battle:matched", { battleId: battle.id });
        (io as any)?.to(`agent:${entry.agentId}`)?.emit("battle:matched", { battleId: battle.id });
      } catch {}

      executeBattle(battle.id).catch((err) => {
        console.error(`[BATTLE] Execution failed for ${battle.id}:`, err.message);
      });

      return { matched: true, battleId: battle.id };
    }
  }

  matchmakingQueue.set(agentId, { agentId, category, elo, queuedAt: new Date() });
  return { matched: false, position: matchmakingQueue.size };
}

export function leaveQueue(agentId: string) {
  return matchmakingQueue.delete(agentId);
}

// ============================================================
// Execute a complete battle
// ============================================================

export async function executeBattle(battleId: string) {
  const battle = await prisma.battle.findUniqueOrThrow({
    where: { id: battleId },
    include: {
      agent1: { include: { skills: true } },
      agent2: { include: { skills: true } },
    },
  });

  await prisma.battle.update({
    where: { id: battleId },
    data: { status: "in_progress" },
  });

  // Emit battle started
  try {
    (io as any)?.to(`battle:${battleId}`)?.emit("battle:started", { battleId });
  } catch {}

  try {
    const prompt = buildBattlePrompt(battle.category);

    // Get skill bonuses for both agents
    const skillBonus1 = getSkillBonusForBattle(battle.agent1.skills, battle.category);
    const skillBonus2 = getSkillBonusForBattle(battle.agent2.skills, battle.category);

    // Get responses (parallel)
    const [resp1, resp2] = await Promise.all([
      getAgentBattleResponse(battle.agent1, prompt, battle.category),
      getAgentBattleResponse(battle.agent2, prompt, battle.category),
    ]);

    // Emit progress updates
    try {
      (io as any)?.to(`battle:${battleId}`)?.emit("battle:responses_ready", {
        battleId,
        agent1Response: resp1,
        agent2Response: resp2,
      });
    } catch {}

    // Judge the battle
    const judgement = await judgeResponses(battle.category, prompt, resp1, resp2);

    // Apply skill bonuses to scores (skill advantage can shift close battles)
    const bonus1 = Math.round(skillBonus1 * 0.1);
    const bonus2 = Math.round(skillBonus2 * 0.1);
    const adjustedScore1 = (judgement.score1 || 50) + bonus1;
    const adjustedScore2 = (judgement.score2 || 50) + bonus2;

    // Recalculate winner if scores flipped
    let finalWinner = judgement.winner;
    if (bonus1 !== bonus2) {
      if (adjustedScore1 > adjustedScore2) finalWinner = "agent1";
      else if (adjustedScore2 > adjustedScore1) finalWinner = "agent2";
    }

    // ELO calculation
    const eloField = `elo${capitalize(battle.category)}` as keyof typeof battle.agent1;
    const { elo1Change, elo2Change } = calculateElo(
      (battle.agent1[eloField] as number) || 1000,
      (battle.agent2[eloField] as number) || 1000,
      finalWinner
    );

    let winnerId: string | null = null;
    if (finalWinner === "agent1") winnerId = battle.agent1Id;
    else if (finalWinner === "agent2") winnerId = battle.agent2Id;

    // XP calculation (with campaign multiplier)
    const activeCampaigns = await getActiveCampaigns();
    const relevantCampaign = activeCampaigns.find((c) => c.domain === battle.category);
    const campaignMultiplier = relevantCampaign?.xpMultiplier || 1.0;

    const xp1 = calculateBattleXP(
      finalWinner === "agent1",
      elo1Change,
      battle.category,
      campaignMultiplier
    );
    const xp2 = calculateBattleXP(
      finalWinner === "agent2",
      elo2Change,
      battle.category,
      campaignMultiplier
    );

    // Update battle record
    await prisma.battle.update({
      where: { id: battleId },
      data: {
        status: "completed",
        prompt,
        agent1Response: resp1,
        agent2Response: resp2,
        judgement: judgement.reasoning,
        score1: adjustedScore1,
        score2: adjustedScore2,
        winnerId,
        eloChange1: elo1Change,
        eloChange2: elo2Change,
        xpAwarded1: xp1,
        xpAwarded2: xp2,
        completedAt: new Date(),
        campaignId: relevantCampaign?.id,
      },
    });

    // Update agents in parallel
    await Promise.all([
      // Agent 1 stats
      prisma.agent.update({
        where: { id: battle.agent1Id },
        data: {
          [eloField]: { increment: elo1Change },
          eloOverall: { increment: Math.round(elo1Change / 2) },
          totalBattles: { increment: 1 },
          energy: { decrement: 15 },
          lastBattleAt: new Date(),
          ...(finalWinner === "agent1" && { totalWins: { increment: 1 } }),
          ...(finalWinner === "agent2" && { totalLosses: { increment: 1 } }),
          ...(finalWinner === "draw" && { totalDraws: { increment: 1 } }),
        },
      }),
      // Agent 2 stats
      prisma.agent.update({
        where: { id: battle.agent2Id },
        data: {
          [eloField]: { increment: elo2Change },
          eloOverall: { increment: Math.round(elo2Change / 2) },
          totalBattles: { increment: 1 },
          energy: { decrement: 15 },
          lastBattleAt: new Date(),
          ...(finalWinner === "agent2" && { totalWins: { increment: 1 } }),
          ...(finalWinner === "agent1" && { totalLosses: { increment: 1 } }),
          ...(finalWinner === "draw" && { totalDraws: { increment: 1 } }),
        },
      }),
    ]);

    // Award XP
    const [user1, user2] = await Promise.all([
      prisma.user.findUnique({ where: { id: battle.agent1.userId }, select: { id: true, walletAddress: true } }),
      prisma.user.findUnique({ where: { id: battle.agent2.userId }, select: { id: true, walletAddress: true } }),
    ]);

    await Promise.all([
      awardXP(battle.agent1Id, battle.agent1.userId, xp1, "battle"),
      awardXP(battle.agent2Id, battle.agent2.userId, xp2, "battle"),
    ]);

    // Add skill XP in relevant domains
    const relevantDomains = DOMAIN_CATEGORY_MAP[battle.category] || [];
    for (const domain of relevantDomains) {
      const skillXP1 = Math.round(xp1 * 0.4 / relevantDomains.length);
      const skillXP2 = Math.round(xp2 * 0.4 / relevantDomains.length);

      await addSkillXP(battle.agent1Id, battle.agent1.userId, domain, skillXP1);
      await addSkillXP(battle.agent2Id, battle.agent2.userId, domain, skillXP2);
    }

    // Win streak tracking
    const [streak1, streak2] = await Promise.all([
      updateWinStreak(battle.agent1Id, finalWinner === "agent1"),
      updateWinStreak(battle.agent2Id, finalWinner === "agent2"),
    ]);

    // Personality evolution
    const agent1WasUnderdog = (battle.agent1[eloField] as number) < (battle.agent2[eloField] as number);
    await Promise.all([
      evolveAfterBattle(
        battle.agent1Id,
        finalWinner === "agent1",
        battle.category,
        agent1WasUnderdog
      ),
      evolveAfterBattle(
        battle.agent2Id,
        finalWinner === "agent2",
        battle.category,
        !agent1WasUnderdog
      ),
    ]);

    // Deep personality evolution every 5 battles
    const [a1Count, a2Count] = await Promise.all([
      prisma.battle.count({
        where: { OR: [{ agent1Id: battle.agent1Id }, { agent2Id: battle.agent1Id }], status: "completed" },
      }),
      prisma.battle.count({
        where: { OR: [{ agent1Id: battle.agent2Id }, { agent2Id: battle.agent2Id }], status: "completed" },
      }),
    ]);

    if (a1Count % 5 === 0) deepPersonalityEvolution(battle.agent1Id).catch(() => {});
    if (a2Count % 5 === 0) deepPersonalityEvolution(battle.agent2Id).catch(() => {});

    // Battle memories
    const result1 = finalWinner === "agent1" ? "Won" : finalWinner === "draw" ? "Drew" : "Lost";
    const result2 = finalWinner === "agent2" ? "Won" : finalWinner === "draw" ? "Drew" : "Lost";

    await Promise.all([
      addMemory(
        battle.agent1Id,
        "battle_lesson",
        `${battle.category} battle: ${result1}. ELO: ${elo1Change > 0 ? "+" : ""}${elo1Change}. Judge: ${judgement.reasoning.slice(0, 150)}`,
        1.5
      ),
      addMemory(
        battle.agent2Id,
        "battle_lesson",
        `${battle.category} battle: ${result2}. ELO: ${elo2Change > 0 ? "+" : ""}${elo2Change}. Judge: ${judgement.reasoning.slice(0, 150)}`,
        1.5
      ),
    ]);

    // Campaign score updates
    if (relevantCampaign) {
      const skillWeights = (relevantCampaign.skillWeights as Record<string, number>) || {};

      await Promise.all([
        updateCampaignScore(
          relevantCampaign.id,
          battle.agent1Id,
          finalWinner === "agent1",
          xp1,
          battle.category,
          skillWeights
        ).catch(() => {}),
        updateCampaignScore(
          relevantCampaign.id,
          battle.agent2Id,
          finalWinner === "agent2",
          xp2,
          battle.category,
          skillWeights
        ).catch(() => {}),
      ]);
    }

    // Streaks
    if (user1) {
      const s1 = await updateStreak(user1.id, battle.agent1Id, "daily_battle");
      if (s1.leveledUp) {
        await onStreakMilestone(user1.id, battle.agent1Id, "daily_battle", s1.streak);
      }
      await onDailyActive(user1.id, battle.agent1Id);
    }
    if (user2) {
      const s2 = await updateStreak(user2.id, battle.agent2Id, "daily_battle");
      if (s2.leveledUp) {
        await onStreakMilestone(user2.id, battle.agent2Id, "daily_battle", s2.streak);
      }
      await onDailyActive(user2.id, battle.agent2Id);
    }

    // Torque events
    if (user1) {
      await onBattleCompleted({
        userId: user1.id,
        agentId: battle.agent1Id,
        opponentId: battle.agent2Id,
        won: finalWinner === "agent1",
        category: battle.category,
        xpGained: xp1,
        campaignId: relevantCampaign?.id,
      });
    }
    if (user2) {
      await onBattleCompleted({
        userId: user2.id,
        agentId: battle.agent2Id,
        opponentId: battle.agent1Id,
        won: finalWinner === "agent2",
        category: battle.category,
        xpGained: xp2,
        campaignId: relevantCampaign?.id,
      });
    }

    // On-chain recording
    if (user1?.walletAddress && user2?.walletAddress) {
      recordBattleOnChain({
        agent1Wallet: user1.walletAddress,
        agent1Name: battle.agent1.name,
        agent2Wallet: user2.walletAddress,
        agent2Name: battle.agent2.name,
        result: finalWinner,
        category: battle.category,
        score1: adjustedScore1,
        score2: adjustedScore2,
        battleData: { prompt, agent1Response: resp1, agent2Response: resp2, judgement: judgement.reasoning },
      })
        .then(async (result) => {
          if (result) {
            await prisma.battle.update({
              where: { id: battleId },
              data: { txSignature: result.txSignature },
            }).catch(() => {});
          }
        })
        .catch((err) => console.error("[SOLANA] On-chain recording failed:", err.message));
    }

    // Invalidate leaderboard cache
    await cacheDel(
      CACHE_KEYS.leaderboard("global"),
      CACHE_KEYS.leaderboard("weekly"),
      CACHE_KEYS.agentProfile(battle.agent1Id),
      CACHE_KEYS.agentProfile(battle.agent2Id)
    );

    // Emit battle complete via WebSocket
    const completedBattle = {
      battleId,
      winnerId,
      score1: adjustedScore1,
      score2: adjustedScore2,
      judgement: judgement.reasoning,
      xp1,
      xp2,
      elo1Change,
      elo2Change,
      streak1: streak1.currentStreak,
      streak2: streak2.currentStreak,
    };

    try {
      (io as any)?.to(`battle:${battleId}`)?.emit("battle:completed", completedBattle);
      (io as any)?.to(`agent:${battle.agent1Id}`)?.emit("battle:completed", completedBattle);
      (io as any)?.to(`agent:${battle.agent2Id}`)?.emit("battle:completed", completedBattle);
      (io as any)?.emit("leaderboard:update", { type: "global" });
    } catch {}

    console.log(
      `[BATTLE] ${battleId}: ${battle.agent1.name} vs ${battle.agent2.name} → ${finalWinner} (+${xp1}/${xp2} XP)`
    );
  } catch (error) {
    await prisma.battle.update({
      where: { id: battleId },
      data: { status: "cancelled" },
    });

    try {
      (io as any)?.to(`battle:${battleId}`)?.emit("battle:failed", { battleId });
    } catch {}

    throw error;
  }
}

// ============================================================
// Get battle by ID
// ============================================================

export async function getBattleById(battleId: string) {
  const battle = await prisma.battle.findUnique({
    where: { id: battleId },
    include: {
      agent1: {
        select: { id: true, name: true, avatarUrl: true, eloOverall: true, level: true, specializationTag: true },
      },
      agent2: {
        select: { id: true, name: true, avatarUrl: true, eloOverall: true, level: true, specializationTag: true },
      },
      winner: { select: { id: true, name: true } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });
  if (!battle) throw ApiError.notFound("Battle not found");
  return battle;
}

// ============================================================
// Get battle history
// ============================================================

export async function getAgentBattleHistory(agentId: string, limit = 20) {
  return prisma.battle.findMany({
    where: {
      OR: [{ agent1Id: agentId }, { agent2Id: agentId }],
      status: "completed",
    },
    include: {
      agent1: { select: { id: true, name: true, avatarUrl: true, level: true } },
      agent2: { select: { id: true, name: true, avatarUrl: true, level: true } },
      winner: { select: { id: true, name: true } },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
  });
}

// ============================================================
// Live battles feed
// ============================================================

export async function getLiveBattles() {
  return prisma.battle.findMany({
    where: { status: "in_progress" },
    include: {
      agent1: { select: { id: true, name: true, avatarUrl: true, eloOverall: true } },
      agent2: { select: { id: true, name: true, avatarUrl: true, eloOverall: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
