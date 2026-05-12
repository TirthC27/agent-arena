// ============================================================
// TORQUE EVENT DISPATCHER
// All platform events fire through here → Torque MCP
// ============================================================

import { prisma } from "../../config/db";
import { torqueClient } from "./torqueClient";
import { cacheGet, cacheSet } from "../../config/redis";

// ============================================================
// Event Type Registry
// ============================================================

export type TorqueEventType =
  | "agent_created"
  | "agent_trained"
  | "agent_memory_updated"
  | "agent_battle_started"
  | "agent_battle_completed"
  | "agent_level_up"
  | "agent_campaign_joined"
  | "campaign_completed"
  | "tournament_won"
  | "streak_started"
  | "streak_completed"
  | "streak_rewarded"
  | "daily_agent_active"
  | "leaderboard_ranked"
  | "raffle_ticket_earned"
  | "reward_claimed"
  | "skill_upgraded"
  | "wallet_funded"
  | "training_completed"
  | "first_win"
  | "xp_milestone"
  | "campaign_win"
  | "battle_rematch_accepted";

interface DispatchPayload {
  userId: string;
  agentId?: string;
  eventType: TorqueEventType;
  metadata?: Record<string, any>;
}

// ============================================================
// Core Dispatcher — persists events then fires to Torque
// ============================================================

export async function dispatchTorqueEvent(
  payload: DispatchPayload
): Promise<void> {
  // 1. Persist to DB (audit log + retry queue)
  const event = await prisma.torqueEvent.create({
    data: {
      userId: payload.userId,
      agentId: payload.agentId,
      eventType: payload.eventType,
      payload: payload.metadata || {},
      status: "pending",
    },
  });

  // 2. Fire async to Torque (non-blocking)
  sendToTorque(event.id, payload).catch((err) => {
    console.error(`[Torque] Dispatch failed for ${payload.eventType}:`, err.message);
  });
}

async function sendToTorque(eventId: string, payload: DispatchPayload) {
  const success = await torqueClient.trackAction({
    type: payload.eventType,
    userId: payload.userId,
    agentId: payload.agentId,
    metadata: payload.metadata,
  });

  await prisma.torqueEvent.update({
    where: { id: eventId },
    data: {
      status: success ? "sent" : "failed",
      sentAt: success ? new Date() : undefined,
      attempts: { increment: 1 },
      error: success ? undefined : "Torque API returned false",
    },
  });
}

// ============================================================
// Retry failed events (called by cron job)
// ============================================================

export async function retryFailedTorqueEvents(): Promise<number> {
  const failed = await prisma.torqueEvent.findMany({
    where: {
      status: "failed",
      attempts: { lt: 5 },
    },
    take: 50,
    orderBy: { createdAt: "asc" },
  });

  let retried = 0;
  for (const event of failed) {
    const success = await torqueClient.trackAction({
      type: event.eventType as TorqueEventType,
      userId: event.userId!,
      agentId: event.agentId || undefined,
      metadata: event.payload as Record<string, any>,
    });

    await prisma.torqueEvent.update({
      where: { id: event.id },
      data: {
        status: success ? "sent" : "failed",
        sentAt: success ? new Date() : undefined,
        attempts: { increment: 1 },
      },
    });

    if (success) retried++;
  }

  return retried;
}

// ============================================================
// High-level event helpers
// ============================================================

export async function onAgentCreated(userId: string, agentId: string, agentName: string) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "agent_created",
    metadata: { agentName },
  });

  // Register user with Torque on first agent creation
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) await torqueClient.registerUser(userId, user.walletAddress);
}

export async function onBattleCompleted(opts: {
  userId: string;
  agentId: string;
  opponentId: string;
  won: boolean;
  category: string;
  xpGained: number;
  campaignId?: string;
}) {
  await dispatchTorqueEvent({
    userId: opts.userId,
    agentId: opts.agentId,
    eventType: "agent_battle_completed",
    metadata: {
      won: opts.won,
      category: opts.category,
      xpGained: opts.xpGained,
      campaignId: opts.campaignId,
    },
  });

  // First win bonus
  const agent = await prisma.agent.findUnique({ where: { id: opts.agentId } });
  if (opts.won && agent && agent.totalWins === 1) {
    await dispatchTorqueEvent({
      userId: opts.userId,
      agentId: opts.agentId,
      eventType: "first_win",
      metadata: { category: opts.category },
    });
  }
}

export async function onLevelUp(userId: string, agentId: string, newLevel: number, xp: number) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "agent_level_up",
    metadata: { newLevel, xp },
  });

  // XP milestones: 1000, 5000, 10000
  const milestones = [1000, 5000, 10000, 25000, 50000];
  for (const milestone of milestones) {
    if (xp >= milestone) {
      const key = `torque:milestone:${agentId}:${milestone}`;
      const alreadySent = await cacheGet<boolean>(key);
      if (!alreadySent) {
        await dispatchTorqueEvent({
          userId, agentId,
          eventType: "xp_milestone",
          metadata: { milestone, xp },
        });
        await cacheSet(key, true, 86400 * 365); // mark as sent
      }
    }
  }
}

export async function onTrainingCompleted(
  userId: string,
  agentId: string,
  domain: string,
  xpGained: number
) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "training_completed",
    metadata: { domain, xpGained },
  });
}

export async function onSkillUpgraded(
  userId: string,
  agentId: string,
  domain: string,
  newLevel: number
) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "skill_upgraded",
    metadata: { domain, newLevel },
  });
}

export async function onCampaignJoined(userId: string, agentId: string, campaignId: string, campaignName: string) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "agent_campaign_joined",
    metadata: { campaignId, campaignName },
  });
}

export async function onStreakMilestone(userId: string, agentId: string, streakType: string, streak: number) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "streak_rewarded",
    metadata: { streakType, streak },
  });

  // Sync streak to Torque
  await torqueClient.recordStreak(userId, streakType, streak);
}

export async function onDailyActive(userId: string, agentId: string) {
  // Dedupe — only once per day
  const today = new Date().toISOString().slice(0, 10);
  const key = `torque:daily:${userId}:${today}`;
  const sent = await cacheGet<boolean>(key);
  if (sent) return;

  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "daily_agent_active",
    metadata: { date: today },
  });
  await cacheSet(key, true, 86400);
}

export async function onWalletFunded(userId: string, agentId: string, amountSOL: number) {
  await dispatchTorqueEvent({
    userId, agentId,
    eventType: "wallet_funded",
    metadata: { amountSOL },
  });
}
