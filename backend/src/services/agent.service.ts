import { prisma } from "../config/db";
import { CreateAgentInput, UpdateAgentInput } from "../types";
import { ApiError } from "../utils/ApiError";
import { getEvolutionInfo } from "./ai/evolution.service";
import { onAgentCreated } from "./torque/eventDispatcher";
import { ensureSkills } from "./skillEngine";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from "../config/redis";
import { getProgressToNextLevel, getRarityTier } from "./xpEngine";

const MAX_AGENTS_PER_USER = 3;

/**
 * Create a new agent for a user
 */
export async function createAgent(userId: string, data: CreateAgentInput) {
  const count = await prisma.agent.count({ where: { userId } });
  if (count >= MAX_AGENTS_PER_USER) {
    throw ApiError.badRequest(`Maximum ${MAX_AGENTS_PER_USER} agents per user`);
  }

  const agent = await prisma.agent.create({
    data: {
      userId,
      name: data.name,
      bio: data.bio,
      avatarUrl: data.avatarUrl,
    },
  });

  // Initialize skill tree
  await ensureSkills(agent.id);

  // Fire Torque event
  await onAgentCreated(userId, agent.id, agent.name);

  return agent;
}

/**
 * Get an agent by ID with full details including skills and evolution
 */
export async function getAgentById(agentId: string) {
  const cached = await cacheGet<any>(CACHE_KEYS.agentProfile(agentId));
  if (cached) return cached;

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      user: { select: { username: true, walletAddress: true } },
      skills: { orderBy: [{ xp: "desc" }] },
      _count: {
        select: {
          battlesAsAgent1: true,
          battlesAsAgent2: true,
          battlesWon: true,
          trainingSessions: true,
        },
      },
    },
  });

  if (!agent) throw ApiError.notFound("Agent not found");

  const evolution = getEvolutionInfo(agent);
  const levelProgress = getProgressToNextLevel(agent.xp);
  const rarity = getRarityTier(agent.level);

  const result = { ...agent, evolution, levelProgress, rarity };

  await cacheSet(CACHE_KEYS.agentProfile(agentId), result, 120);
  return result;
}

/**
 * Get all agents for a user
 */
export async function getUserAgents(userId: string) {
  const agents = await prisma.agent.findMany({
    where: { userId },
    include: {
      skills: { orderBy: [{ xp: "desc" }], take: 3 },
      _count: {
        select: { battlesAsAgent1: true, battlesAsAgent2: true },
      },
    },
    orderBy: { xp: "desc" },
  });

  return agents.map((a) => ({
    ...a,
    evolution: getEvolutionInfo(a),
    levelProgress: getProgressToNextLevel(a.xp),
    rarity: getRarityTier(a.level),
  }));
}

/**
 * Update an agent (only by owner)
 */
export async function updateAgent(
  agentId: string,
  userId: string,
  data: UpdateAgentInput
) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  const updated = await prisma.agent.update({
    where: { id: agentId },
    data,
  });

  await cacheDel(CACHE_KEYS.agentProfile(agentId));
  return updated;
}

/**
 * Get agent personality traits
 */
export function getAgentTraits(agent: {
  traitAnalytical: number | null;
  traitCreative: number | null;
  traitAggressive: number | null;
  traitCautious: number | null;
  traitSocial: number | null;
  traitStrategic: number | null;
  traitConfidence: number;
  traitRiskAppetite: number;
  traitCompetitive: number;
  traitAdaptability: number;
}) {
  return {
    analytical: agent.traitAnalytical,
    creative: agent.traitCreative,
    aggressive: agent.traitAggressive,
    cautious: agent.traitCautious,
    social: agent.traitSocial,
    strategic: agent.traitStrategic,
    confidence: agent.traitConfidence,
    riskAppetite: agent.traitRiskAppetite,
    competitive: agent.traitCompetitive,
    adaptability: agent.traitAdaptability,
  };
}

/**
 * Delete an agent (only by owner)
 */
export async function deleteAgent(agentId: string, userId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  await prisma.battle.deleteMany({
    where: { OR: [{ agent1Id: agentId }, { agent2Id: agentId }] },
  });

  await cacheDel(CACHE_KEYS.agentProfile(agentId));

  return prisma.agent.delete({ where: { id: agentId } });
}
