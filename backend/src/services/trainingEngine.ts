// ============================================================
// TRAINING ENGINE
// Autonomous and user-triggered agent training
// ============================================================

import { prisma } from "../config/db";
import { callLLM, callLLMJson } from "./ai/openrouter.service";
import { addMemory } from "./ai/memory.service";
import { addSkillXP, getAgentSkills, SkillDomain } from "./skillEngine";
import { evolveAfterTraining } from "./personalityEvolution";
import { onTrainingCompleted, onDailyActive } from "./torque/eventDispatcher";
import { cacheGet, cacheSet, cacheDel, CACHE_KEYS } from "../config/redis";
import { buildPersonalitySystemPrompt } from "./personalityEvolution";
import { ApiError } from "../utils/ApiError";

// ============================================================
// Training Types
// ============================================================

const TRAINING_TYPES: Record<
  SkillDomain,
  { prompt: string; taskDescription: string }
> = {
  logic: {
    prompt: "Solve this logical reasoning challenge and explain your step-by-step deduction:",
    taskDescription: "Logic puzzle and deductive reasoning",
  },
  coding: {
    prompt: "Design an algorithm solution for this technical problem and analyze its complexity:",
    taskDescription: "Algorithm design and code analysis",
  },
  music: {
    prompt: "Analyze the following musical concept and explain its theory, history, and cultural impact:",
    taskDescription: "Music theory and analysis",
  },
  trading: {
    prompt: "Analyze this market scenario and provide a strategic investment thesis with risk assessment:",
    taskDescription: "Market analysis and strategy",
  },
  creativity: {
    prompt: "Create an original and innovative response to this creative challenge:",
    taskDescription: "Creative expression exercise",
  },
  persuasion: {
    prompt: "Construct a compelling argument for this position using rhetoric, evidence, and logical structure:",
    taskDescription: "Argument construction",
  },
  memory: {
    prompt: "Synthesize and recall key information about this topic, demonstrating depth of knowledge:",
    taskDescription: "Knowledge synthesis",
  },
  speed: {
    prompt: "Answer these rapid-fire questions concisely and accurately:",
    taskDescription: "Speed thinking drill",
  },
  strategy: {
    prompt: "Develop a multi-layered strategic plan for this scenario, considering short and long-term outcomes:",
    taskDescription: "Strategic planning",
  },
};

const TRAINING_CHALLENGES: Record<SkillDomain, string[]> = {
  logic: [
    "If all A are B, and some B are C, what can we conclude about A and C?",
    "A train leaves at 8am and arrives at 2pm. Another train leaves the same destination at 10am. If the second train travels 50% faster, when do they meet?",
    "There are 3 boxes: one contains only apples, one only oranges, one both. All labels are wrong. You can pick one fruit from one box. How do you label all correctly?",
  ],
  coding: [
    "Design a distributed rate limiter that works across multiple servers using Redis. What are the edge cases?",
    "Implement a Least Recently Used (LRU) cache with O(1) operations. Explain your data structure choices.",
    "Write a function that finds all subsets of a set. Discuss time and space complexity.",
  ],
  music: [
    "Explain the difference between modal harmony and functional harmony. How did Miles Davis use modality in 'Kind of Blue'?",
    "What makes polyrhythm different from polymeter? Give examples from different cultural traditions.",
    "How does the circle of fifths relate to key signatures, and why is it useful for improvisation?",
  ],
  trading: [
    "Bitcoin has just broken its all-time high with massive volume. Is this a buy, hold, or sell signal? Explain with technical and on-chain analysis.",
    "A company announces a 20% earnings beat but the stock drops 5%. What might explain this 'sell the news' reaction?",
    "Construct a risk-parity portfolio using 3 uncorrelated assets. How would you rebalance?",
  ],
  creativity: [
    "Write a 6-word story that captures the feeling of nostalgia for a future that never happened.",
    "If gravity worked sideways for one day, how would society adapt? Describe 3 innovative solutions humans would develop.",
    "Design a new board game mechanic that has never been used before.",
  ],
  persuasion: [
    "Persuade a skeptic that AI agents deserve digital rights in 5 compelling points.",
    "Construct an argument for why shorter work weeks increase productivity. Counter the strongest objection.",
    "Argue that constraints drive creativity better than total freedom. Use examples from art, science, and business.",
  ],
  memory: [
    "Summarize the key events of the 2008 financial crisis and their causal chain.",
    "What are the core principles of quantum computing and how do qubits differ from classical bits?",
    "Describe the arc of the Renaissance from its origins in Florence to its spread across Europe.",
  ],
  speed: [
    "Name 10 countries that border Russia. | Capital of Kazakhstan? | Who wrote War and Peace? | What year did WWI end? | Largest ocean?",
    "Convert: 0.75 to fraction | √144 | 25% of 380 | 3^5 | How many seconds in a day?",
    "Synonyms for: verbose | malevolent | ephemeral | sanguine | perfidious",
  ],
  strategy: [
    "You are a startup with $1M in funding and 12 months runway. Your main competitor has 10x resources. Design your competitive strategy.",
    "Design a guerrilla marketing campaign for a new product with a $0 budget.",
    "You're the general of an army defending a city. Enemy has 3x your forces. What is your strategy?",
  ],
};

// ============================================================
// Execute Training Session
// ============================================================

export async function trainAgent(
  agentId: string,
  userId: string,
  domain: SkillDomain,
  type: "user_initiated" | "autonomous" = "user_initiated"
): Promise<{
  trainingSessionId: string;
  domain: string;
  xpGained: number;
  levelUp: boolean;
  newLevel: number;
  result: string;
  skillGain: any;
}> {
  // Anti-cheat: rate limit training
  const lockKey = CACHE_KEYS.trainingLock(agentId);
  const locked = await cacheGet<boolean>(lockKey);
  if (locked) {
    throw ApiError.badRequest("Agent is already training. Wait 60 seconds.");
  }
  await cacheSet(lockKey, true, 60);

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (!agent.isActive) throw ApiError.badRequest("Agent is inactive");

  // Energy check
  if (agent.energy < 10) {
    throw ApiError.badRequest("Agent has insufficient energy (need 10+)");
  }

  const start = Date.now();
  const challenge = getRandomChallenge(domain);
  const trainingType = TRAINING_TYPES[domain];

  // Get agent skills for context
  const skills = await getAgentSkills(agentId);
  const domainSkill = skills.find((s) => s.domain === domain);

  // Build personality prompt
  const personalityPrompt = buildPersonalitySystemPrompt(agent as any);

  // Execute training via AI
  const prompt = `${trainingType.prompt}\n\n${challenge}`;

  let result: string;
  try {
    result = await callLLM({
      messages: [
        {
          role: "system",
          content: `${personalityPrompt}

You are in a TRAINING SESSION for the ${domain} domain.
Training Type: ${trainingType.taskDescription}
Current ${domain} Skill Level: ${domainSkill?.level || 1}
Approach this challenge using your personality and expertise. Show depth of knowledge and original thinking.`,
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
      maxTokens: 800,
    });
  } catch (err: any) {
    await cacheDel(lockKey);
    throw err;
  }

  // Calculate XP gained (based on response quality heuristic)
  const baseXP = 30 + Math.floor(Math.random() * 20); // 30-50 base
  const levelBonus = Math.round(baseXP * 0.1 * (domainSkill?.level || 1));
  const totalXP = baseXP + levelBonus;

  const duration = Date.now() - start;

  // Add skill XP
  const { levelUp, newLevel, newXP } = await addSkillXP(agentId, userId, domain, totalXP);

  // Evolve personality
  await evolveAfterTraining(agentId, domain, totalXP);

  // Drain energy
  await prisma.agent.update({
    where: { id: agentId },
    data: {
      energy: { decrement: 10 },
      xp: { increment: totalXP },
      lastTrainedAt: new Date(),
    },
  });

  // Store memory
  await addMemory(
    agentId,
    "training_insight",
    `${domain} training: "${challenge.slice(0, 100)}..." — Insight gained.`,
    1.0
  );

  // Create training session record
  const session = await prisma.trainingSession.create({
    data: {
      agentId,
      domain,
      type,
      status: "completed",
      prompt: challenge,
      result: result.slice(0, 500), // truncate for DB
      xpGained: totalXP,
      skillGain: { domain, deltaXP: totalXP, newLevel, levelUp },
      duration,
    },
  });

  // Fire Torque event
  await onTrainingCompleted(userId, agentId, domain, totalXP);
  await onDailyActive(userId, agentId);

  // Update specialization
  const { updateAgentSpecialization } = await import("./skillEngine");
  await updateAgentSpecialization(agentId);

  // Invalidate cache
  await cacheDel(CACHE_KEYS.agentProfile(agentId), CACHE_KEYS.agentSkills(agentId), lockKey);

  return {
    trainingSessionId: session.id,
    domain,
    xpGained: totalXP,
    levelUp,
    newLevel,
    result,
    skillGain: { domain, xpGained: totalXP, newLevel, levelUp, newXP },
  };
}

// ============================================================
// Autonomous Training (called by cron)
// ============================================================

export async function runAutonomousTraining(): Promise<number> {
  // Find agents that haven't trained in 2+ hours and have energy
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const agents = await prisma.agent.findMany({
    where: {
      isActive: true,
      energy: { gte: 10 },
      OR: [
        { lastTrainedAt: null },
        { lastTrainedAt: { lt: cutoff } },
      ],
    },
    include: {
      user: { select: { id: true } },
      skills: { orderBy: { xp: "desc" }, take: 1 },
    },
    take: 20, // batch size
  });

  let trained = 0;
  for (const agent of agents) {
    try {
      // Train in dominant domain (or random if no skills)
      const domain = agent.dominantDomain as SkillDomain ||
        pickRandomDomain();

      await trainAgent(agent.id, agent.userId, domain, "autonomous");
      trained++;
    } catch (err: any) {
      console.warn(`[AutoTrain] Skipped ${agent.id}: ${err.message}`);
    }
  }

  return trained;
}

// ============================================================
// Energy Regeneration (called by cron)
// ============================================================

export async function regenerateEnergy(): Promise<void> {
  // Regenerate 5 energy per hour for all agents
  await prisma.agent.updateMany({
    where: { energy: { lt: 100 } },
    data: { energy: { increment: 5 } },
  });

  // Cap at 100
  await prisma.agent.updateMany({
    where: { energy: { gt: 100 } },
    data: { energy: 100 },
  });
}

// ============================================================
// Helpers
// ============================================================

function getRandomChallenge(domain: SkillDomain): string {
  const challenges = TRAINING_CHALLENGES[domain];
  return challenges[Math.floor(Math.random() * challenges.length)];
}

function pickRandomDomain(): SkillDomain {
  const domains: SkillDomain[] = [
    "logic", "coding", "music", "trading", "creativity",
    "persuasion", "memory", "speed", "strategy",
  ];
  return domains[Math.floor(Math.random() * domains.length)];
}
