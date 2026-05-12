// ============================================================
// XP & LEVEL PROGRESSION SYSTEM
// ============================================================

import { prisma } from "../config/db";
import { onLevelUp } from "./torque/eventDispatcher";
import { cacheDel, CACHE_KEYS } from "../config/redis";
import { detectXPAnomaly } from "./antiCheat";

// ============================================================
// Level Progression Formula (exponential)
// ============================================================

// XP required to reach level N (cumulative total)
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  // Formula: 100 * (level-1)^1.8
  return Math.round(100 * Math.pow(level - 1, 1.8));
}

export function getLevelFromXP(totalXP: number): number {
  let level = 1;
  while (getXPForLevel(level + 1) <= totalXP) {
    level++;
    if (level >= 50) break; // Hard cap
  }
  return level;
}

export function getProgressToNextLevel(xp: number): {
  level: number;
  currentLevelXP: number;
  nextLevelXP: number;
  xpIntoLevel: number;
  progressPercent: number;
} {
  const level = getLevelFromXP(xp);
  const currentLevelXP = getXPForLevel(level);
  const nextLevelXP = getXPForLevel(level + 1);
  const xpIntoLevel = xp - currentLevelXP;
  const levelRange = nextLevelXP - currentLevelXP;

  return {
    level,
    currentLevelXP,
    nextLevelXP,
    xpIntoLevel,
    progressPercent:
      level >= 50 ? 100 : Math.round((xpIntoLevel / levelRange) * 100),
  };
}

// ============================================================
// Award XP to Agent
// ============================================================

export async function awardXP(
  agentId: string,
  userId: string,
  amount: number,
  source: "battle" | "training" | "campaign" | "bonus"
): Promise<{ newXP: number; newLevel: number; leveledUp: boolean }> {
  // Anti-cheat
  const flagged = await detectXPAnomaly(agentId, amount);
  if (flagged) {
    amount = Math.min(amount, 1000); // Cap suspicious gains
  }

  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { xp: true, level: true },
  });

  if (!agent) throw new Error("Agent not found");

  const newXP = agent.xp + amount;
  const newLevel = getLevelFromXP(newXP);
  const leveledUp = newLevel > agent.level;

  await prisma.agent.update({
    where: { id: agentId },
    data: { xp: newXP, level: newLevel },
  });

  if (leveledUp) {
    await onLevelUp(userId, agentId, newLevel, newXP);
    console.log(`[XP] ${agentId} leveled up! ${agent.level} → ${newLevel} (${newXP} XP)`);
  }

  await cacheDel(
    CACHE_KEYS.agentProfile(agentId),
    CACHE_KEYS.leaderboard("global"),
    CACHE_KEYS.leaderboard("highest_xp")
  );

  return { newXP, newLevel, leveledUp };
}

// ============================================================
// Battle XP Formula
// ============================================================

export function calculateBattleXP(
  won: boolean,
  eloChange: number,
  category: string,
  campaignMultiplier = 1.0
): number {
  const base = won ? 75 : 25;
  const eloBonus = Math.max(0, Math.round(Math.abs(eloChange) * 0.5));
  const total = Math.round((base + eloBonus) * campaignMultiplier);
  return Math.min(total, 500); // Cap at 500 per battle
}

// ============================================================
// ELO Calculation
// ============================================================

export function calculateElo(
  elo1: number,
  elo2: number,
  result: "agent1" | "agent2" | "draw"
): { elo1Change: number; elo2Change: number } {
  const K = 32; // Standard K-factor

  const expected1 = 1 / (1 + Math.pow(10, (elo2 - elo1) / 400));
  const expected2 = 1 - expected1;

  let score1: number;
  let score2: number;

  if (result === "agent1") {
    score1 = 1;
    score2 = 0;
  } else if (result === "agent2") {
    score1 = 0;
    score2 = 1;
  } else {
    score1 = 0.5;
    score2 = 0.5;
  }

  const elo1Change = Math.round(K * (score1 - expected1));
  const elo2Change = Math.round(K * (score2 - expected2));

  return { elo1Change, elo2Change };
}

// ============================================================
// Win Streak Tracking
// ============================================================

export async function updateWinStreak(
  agentId: string,
  won: boolean
): Promise<{ currentStreak: number; bestStreak: number; isRecord: boolean }> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { winStreak: true, bestWinStreak: true },
  });

  if (!agent) throw new Error("Agent not found");

  const newStreak = won ? agent.winStreak + 1 : 0;
  const newBest = Math.max(newStreak, agent.bestWinStreak);
  const isRecord = newStreak > agent.bestWinStreak && newStreak > 0;

  await prisma.agent.update({
    where: { id: agentId },
    data: { winStreak: newStreak, bestWinStreak: newBest },
  });

  return {
    currentStreak: newStreak,
    bestStreak: newBest,
    isRecord,
  };
}

// ============================================================
// Rarity Tier from Level
// ============================================================

export function getRarityTier(level: number): {
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythic";
  color: string;
  glow: string;
} {
  if (level >= 40) return { rarity: "mythic", color: "#FF0080", glow: "0 0 20px #FF0080" };
  if (level >= 25) return { rarity: "legendary", color: "#FFD700", glow: "0 0 15px #FFD700" };
  if (level >= 15) return { rarity: "epic", color: "#9B59B6", glow: "0 0 12px #9B59B6" };
  if (level >= 10) return { rarity: "rare", color: "#3498DB", glow: "0 0 10px #3498DB" };
  if (level >= 5) return { rarity: "uncommon", color: "#2ECC71", glow: "0 0 8px #2ECC71" };
  return { rarity: "common", color: "#95A5A6", glow: "none" };
}
