import { prisma } from "../config/db";
import { capitalize } from "../utils/scoring";

/**
 * Get global or category-specific leaderboard
 */
export async function getLeaderboard(category?: string, limit: number = 50) {
  const orderField = category ? `elo${capitalize(category)}` : "eloOverall";

  return prisma.agent.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      eloOverall: true,
      eloKnowledge: true,
      eloStrategy: true,
      eloProductivity: true,
      eloPrediction: true,
      eloSocial: true,
      totalWins: true,
      totalLosses: true,
      totalDraws: true,
      bestWinStreak: true,
      traitAnalytical: true,
      traitCreative: true,
      traitAggressive: true,
      traitCautious: true,
      traitSocial: true,
      traitStrategic: true,
      user: {
        select: { username: true, walletAddress: true },
      },
    },
    orderBy: { [orderField]: "desc" },
    take: limit,
  });
}
