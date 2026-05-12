// ============================================================
// TORQUE MCP CLIENT
// Torque Labs engagement engine integration
// ============================================================

import { env } from "../../config/env";
import { prisma } from "../../config/db";


const TORQUE_API_BASE = process.env.TORQUE_API_URL || "https://api.torque.so";
const TORQUE_API_KEY = process.env.TORQUE_API_KEY || "";

// ============================================================
// Types
// ============================================================

export interface TorqueUserAction {
  type: string;
  userId: string;
  agentId?: string;
  metadata?: Record<string, any>;
}

export interface TorqueCampaignConfig {
  name: string;
  description: string;
  type: "points" | "leaderboard" | "raffle" | "streak" | "rebate";
  startDate: string;
  endDate: string;
  requirements?: TorqueRequirement[];
  rewards?: TorqueRewardConfig[];
  metadata?: Record<string, any>;
}

export interface TorqueRequirement {
  type: string;
  target?: number;
  description?: string;
}

export interface TorqueRewardConfig {
  type: "token" | "nft" | "points" | "raffle_ticket";
  amount?: number;
  tokenAddress?: string;
  description?: string;
}

// ============================================================
// Core HTTP client
// ============================================================

async function torqueRequest<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: unknown
): Promise<T | null> {
  if (!TORQUE_API_KEY) {
    console.warn("[Torque] No API key configured — skipping request");
    return null;
  }

  try {
    const response = await fetch(`${TORQUE_API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TORQUE_API_KEY}`,
        "X-App-Name": "agent-arena",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "no body");
      console.error(`[Torque] HTTP ${response.status} for ${path}: ${text}`);
      return null;
    }

    return await response.json() as T;
  } catch (err: any) {
    console.error(`[Torque] Request failed: ${err.message}`);
    return null;
  }
}

// ============================================================
// Campaign management
// ============================================================

export async function createTorqueCampaign(
  config: TorqueCampaignConfig
): Promise<string | null> {
  const result = await torqueRequest<{ id: string }>(
    "/v1/campaigns",
    "POST",
    config
  );
  return result?.id || null;
}

export async function getTorqueCampaign(campaignId: string) {
  return torqueRequest(`/v1/campaigns/${campaignId}`);
}

export async function endTorqueCampaign(campaignId: string) {
  return torqueRequest(`/v1/campaigns/${campaignId}/end`, "POST");
}

// ============================================================
// User Actions / Events
// ============================================================

export async function trackTorqueAction(
  action: TorqueUserAction
): Promise<boolean> {
  const result = await torqueRequest<{ success: boolean }>(
    "/v1/actions",
    "POST",
    {
      userId: action.userId,
      actionType: action.type,
      metadata: {
        agentId: action.agentId,
        ...action.metadata,
      },
    }
  );
  return result?.success === true;
}

// ============================================================
// Rewards
// ============================================================

export async function distributeTorqueReward(
  userId: string,
  rewardType: string,
  amount: number,
  metadata?: Record<string, any>
): Promise<boolean> {
  const result = await torqueRequest<{ success: boolean }>(
    "/v1/rewards/distribute",
    "POST",
    { userId, rewardType, amount, metadata }
  );
  return result?.success === true;
}

// ============================================================
// Raffles
// ============================================================

export async function createTorqueRaffle(config: {
  name: string;
  ticketsPerEntry: number;
  prizeDescription: string;
  drawDate: string;
}): Promise<string | null> {
  const result = await torqueRequest<{ id: string }>(
    "/v1/raffles",
    "POST",
    config
  );
  return result?.id || null;
}

export async function grantRaffleTickets(
  userId: string,
  raffleId: string,
  tickets: number
): Promise<boolean> {
  const result = await torqueRequest<{ success: boolean }>(
    `/v1/raffles/${raffleId}/grant`,
    "POST",
    { userId, tickets }
  );
  return result?.success === true;
}

// ============================================================
// Streaks
// ============================================================

export async function recordTorqueStreak(
  userId: string,
  streakType: string,
  currentStreak: number
): Promise<boolean> {
  const result = await torqueRequest<{ success: boolean }>(
    "/v1/streaks/record",
    "POST",
    { userId, streakType, currentStreak }
  );
  return result?.success === true;
}

// ============================================================
// Leaderboard sync
// ============================================================

export async function syncLeaderboardToTorque(
  campaignId: string,
  entries: Array<{ userId: string; score: number; rank: number }>
): Promise<boolean> {
  const result = await torqueRequest<{ success: boolean }>(
    `/v1/campaigns/${campaignId}/leaderboard`,
    "POST",
    { entries }
  );
  return result?.success === true;
}

// ============================================================
// User registration with Torque
// ============================================================

export async function registerUserWithTorque(
  userId: string,
  walletAddress: string
): Promise<boolean> {
  const result = await torqueRequest<{ success: boolean }>(
    "/v1/users/register",
    "POST",
    { userId, walletAddress, platform: "agent-arena" }
  );
  return result?.success === true;
}

export const torqueClient = {
  createCampaign: createTorqueCampaign,
  getCampaign: getTorqueCampaign,
  endCampaign: endTorqueCampaign,
  trackAction: trackTorqueAction,
  distributeReward: distributeTorqueReward,
  createRaffle: createTorqueRaffle,
  grantRaffleTickets,
  recordStreak: recordTorqueStreak,
  syncLeaderboard: syncLeaderboardToTorque,
  registerUser: registerUserWithTorque,
};
