// ============================================================
// SKILL ENGINE
// Domain-specific skill trees and progression
// ============================================================

import { prisma } from "../config/db";
import { cacheDel, CACHE_KEYS } from "../config/redis";
import { onSkillUpgraded } from "./torque/eventDispatcher";

// ============================================================
// Skill Configuration
// ============================================================

export const SKILL_DOMAINS = [
  "logic",
  "coding",
  "music",
  "trading",
  "creativity",
  "persuasion",
  "memory",
  "speed",
  "strategy",
] as const;

export type SkillDomain = typeof SKILL_DOMAINS[number];

// XP required to reach each level (exponential curve)
export function getXPForLevel(level: number): number {
  // Level 1: 0 XP, Level 2: 100, Level 3: 250, Level 4: 500, Level 5: 900...
  return Math.round(100 * Math.pow(level - 1, 1.6));
}

export function getLevelFromXP(xp: number): number {
  let level = 1;
  while (getXPForLevel(level + 1) <= xp) {
    level++;
    if (level >= 20) break; // Max level 20
  }
  return level;
}

// ============================================================
// Specialization Tags
// ============================================================

const SPECIALIZATIONS: Record<SkillDomain, Record<number, string>> = {
  logic: { 5: "Reasoner", 10: "Logic Master", 15: "Grand Reasoner", 20: "Oracle" },
  coding: { 5: "Coder", 10: "Engineer", 15: "Architect", 20: "Code Deity" },
  music: { 5: "Listener", 10: "Musician", 15: "Composer", 20: "Music Legend" },
  trading: { 5: "Trader", 10: "Analyst", 15: "Strategist", 20: "Market Oracle" },
  creativity: { 5: "Creator", 10: "Innovator", 15: "Visionary", 20: "Creative God" },
  persuasion: { 5: "Debater", 10: "Orator", 15: "Persuader", 20: "Rhetoric King" },
  memory: { 5: "Memorist", 10: "Scholar", 15: "Savant", 20: "Memory Legend" },
  speed: { 5: "Quick Thinker", 10: "Blitz Mind", 15: "Speed Demon", 20: "Lightning" },
  strategy: { 5: "Tactician", 10: "Strategist", 15: "Grandmaster", 20: "War God" },
};

// ============================================================
// Skill Operations
// ============================================================

export async function ensureSkills(agentId: string): Promise<void> {
  const existing = await prisma.agentSkill.findMany({
    where: { agentId },
    select: { domain: true },
  });
  const existingDomains = new Set(existing.map((s) => s.domain));

  const missing = SKILL_DOMAINS.filter((d) => !existingDomains.has(d));
  if (missing.length === 0) return;

  await prisma.agentSkill.createMany({
    data: missing.map((domain) => ({ agentId, domain })),
    skipDuplicates: true,
  });
}

export async function addSkillXP(
  agentId: string,
  userId: string,
  domain: SkillDomain,
  xpToAdd: number
): Promise<{ levelUp: boolean; newLevel: number; newXP: number }> {
  await ensureSkills(agentId);

  const skill = await prisma.agentSkill.findUnique({
    where: { agentId_domain: { agentId, domain } },
  });

  const currentXP = (skill?.xp || 0) + xpToAdd;
  const oldLevel = skill?.level || 1;
  const newLevel = getLevelFromXP(currentXP);
  const leveled = newLevel > oldLevel;

  // Calculate new confidence (wins improve it)
  const newConfidence = Math.min(1.0, (skill?.confidence || 0.5) + xpToAdd / 5000);

  await prisma.agentSkill.update({
    where: { agentId_domain: { agentId, domain } },
    data: {
      xp: currentXP,
      level: newLevel,
      confidence: newConfidence,
    },
  });

  if (leveled) {
    // Update specialization tag
    const tag = getSpecializationTag(domain, newLevel);
    if (tag) {
      await prisma.agentSkill.update({
        where: { agentId_domain: { agentId, domain } },
        data: { specialization: tag },
      });
    }

    // Fire Torque event
    await onSkillUpgraded(userId, agentId, domain, newLevel);
    console.log(`[Skills] ${agentId}: ${domain} leveled to ${newLevel}!`);
  }

  await cacheDel(CACHE_KEYS.agentSkills(agentId), CACHE_KEYS.agentProfile(agentId));

  return { levelUp: leveled, newLevel, newXP: currentXP };
}

export function getSpecializationTag(domain: SkillDomain, level: number): string | null {
  const tiers = SPECIALIZATIONS[domain];
  const thresholds = Object.keys(tiers)
    .map(Number)
    .sort((a, b) => b - a);

  for (const threshold of thresholds) {
    if (level >= threshold) return tiers[threshold];
  }
  return null;
}

export async function getAgentSkills(agentId: string) {
  await ensureSkills(agentId);
  return prisma.agentSkill.findMany({
    where: { agentId },
    orderBy: [{ xp: "desc" }],
  });
}

// ============================================================
// Specialization Engine
// ============================================================

export async function updateAgentSpecialization(agentId: string): Promise<void> {
  const skills = await prisma.agentSkill.findMany({
    where: { agentId },
    orderBy: [{ xp: "desc" }],
  });

  if (!skills.length) return;

  const topSkill = skills[0];
  const specialization = getSpecializationTag(
    topSkill.domain as SkillDomain,
    topSkill.level
  );

  await prisma.agent.update({
    where: { id: agentId },
    data: {
      dominantDomain: topSkill.domain,
      specializationTag: specialization,
    },
  });
}

// ============================================================
// Domain → Category mapping (for battle skill bonuses)
// ============================================================

export const DOMAIN_CATEGORY_MAP: Record<string, SkillDomain[]> = {
  knowledge: ["logic", "memory", "speed"],
  strategy: ["strategy", "logic", "trading"],
  productivity: ["strategy", "speed", "memory"],
  prediction: ["trading", "logic", "strategy"],
  social: ["persuasion", "creativity", "memory"],
  music: ["music", "creativity", "memory"],
  coding: ["coding", "logic", "speed"],
  debate: ["persuasion", "logic", "creativity"],
};

export function getSkillBonusForBattle(
  skills: Array<{ domain: string; level: number; confidence: number }>,
  category: string
): number {
  const relevantDomains = DOMAIN_CATEGORY_MAP[category] || [];
  if (!relevantDomains.length) return 0;

  let bonus = 0;
  for (const domain of relevantDomains) {
    const skill = skills.find((s) => s.domain === domain);
    if (skill) {
      // Each relevant skill contributes: level * 2 + confidence * 10
      bonus += skill.level * 2 + skill.confidence * 10;
    }
  }

  // Normalize: max possible bonus per domain is ~50
  return Math.min(bonus / relevantDomains.length, 100);
}
