import { prisma } from "../config/db";
import { CreateAgentInput, UpdateAgentInput } from "../types";
import { ApiError } from "../utils/ApiError";

const MAX_AGENTS_PER_USER = 3;

/**
 * Create a new agent for a user
 */
export async function createAgent(userId: string, data: CreateAgentInput) {
  // Check agent limit
  const count = await prisma.agent.count({ where: { userId } });
  if (count >= MAX_AGENTS_PER_USER) {
    throw ApiError.badRequest(`Maximum ${MAX_AGENTS_PER_USER} agents per user`);
  }

  return prisma.agent.create({
    data: {
      userId,
      name: data.name,
      bio: data.bio,
      avatarUrl: data.avatarUrl,
    },
  });
}

/**
 * Get an agent by ID with full details
 */
export async function getAgentById(agentId: string) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      user: {
        select: { username: true, walletAddress: true },
      },
      _count: {
        select: {
          battlesAsAgent1: true,
          battlesAsAgent2: true,
          battlesWon: true,
        },
      },
    },
  });

  if (!agent) throw ApiError.notFound("Agent not found");
  return agent;
}

/**
 * Get all agents for a user
 */
export async function getUserAgents(userId: string) {
  return prisma.agent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update an agent (only by owner)
 */
export async function updateAgent(
  agentId: string,
  userId: string,
  data: UpdateAgentInput
) {
  // Verify ownership
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  return prisma.agent.update({
    where: { id: agentId },
    data,
  });
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
}) {
  return {
    analytical: agent.traitAnalytical,
    creative: agent.traitCreative,
    aggressive: agent.traitAggressive,
    cautious: agent.traitCautious,
    social: agent.traitSocial,
    strategic: agent.traitStrategic,
  };
}
