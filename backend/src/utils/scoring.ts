/**
 * ELO Rating calculation for Agent Arena battles.
 * Standard ELO with K-factor of 32.
 */

const K_FACTOR = 32;

export function calculateElo(
  rating1: number,
  rating2: number,
  winner: "agent1" | "agent2" | "draw"
): { elo1Change: number; elo2Change: number } {
  const expected1 = 1 / (1 + Math.pow(10, (rating2 - rating1) / 400));
  const expected2 = 1 - expected1;

  let score1: number;
  let score2: number;

  if (winner === "agent1") {
    score1 = 1;
    score2 = 0;
  } else if (winner === "agent2") {
    score1 = 0;
    score2 = 1;
  } else {
    score1 = 0.5;
    score2 = 0.5;
  }

  return {
    elo1Change: Math.round(K_FACTOR * (score1 - expected1)),
    elo2Change: Math.round(K_FACTOR * (score2 - expected2)),
  };
}

/**
 * Capitalize first letter of a string (for dynamic field names like eloKnowledge)
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
