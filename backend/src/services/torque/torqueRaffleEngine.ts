// ============================================================
// TORQUE RAFFLE ENGINE
// Agent-created raffles via Torque MCP
// ============================================================

import { prisma } from "../../config/db";
import { torqueClient } from "./torqueClient";
import { dispatchTorqueEvent } from "./eventDispatcher";

// ============================================================
// Create Raffle (agent-initiated or campaign-attached)
// ============================================================

export async function createAgentRaffle(opts: {
  agentId: string;
  name: string;
  description: string;
  prizeSOL: number;
  prizeTitle: string;
  drawInHours: number;
  campaignId?: string;
}): Promise<string | null> {
  const agent = await prisma.agent.findUnique({ where: { id: opts.agentId } });
  if (!agent) return null;

  if (agent.devnetBalance < opts.prizeSOL) {
    console.log(`[Raffle] Agent ${agent.name} can't afford raffle prize`);
    return null;
  }

  const drawAt = new Date(Date.now() + opts.drawInHours * 60 * 60 * 1000);

  const raffle = await prisma.raffle.create({
    data: {
      name: opts.name,
      description: opts.description,
      prizeSOL: opts.prizeSOL,
      prizeTitle: opts.prizeTitle,
      status: "active",
      drawAt,
    },
  });

  // Register with Torque
  const torqueId = await torqueClient.createRaffle({
    name: opts.name,
    ticketsPerEntry: 1,
    prizeDescription: `${opts.prizeTitle} (${opts.prizeSOL} SOL)`,
    drawDate: drawAt.toISOString(),
  });

  if (torqueId) {
    await prisma.raffle.update({
      where: { id: raffle.id },
      data: { torqueRaffleId: torqueId },
    });
  }

  // Deduct prize from treasury
  const balanceBefore = agent.devnetBalance;
  await prisma.agent.update({
    where: { id: opts.agentId },
    data: { devnetBalance: { decrement: opts.prizeSOL } },
  });
  await prisma.walletTransaction.create({
    data: {
      agentId: opts.agentId,
      type: "tournament_fee",
      amount: -opts.prizeSOL,
      balanceBefore,
      balanceAfter: balanceBefore - opts.prizeSOL,
      description: `Raffle prize pool: ${opts.name}`,
    },
  });

  await prisma.autonomousAction.create({
    data: {
      agentId: opts.agentId,
      actionType: "raffle_created",
      description: `Created raffle "${opts.name}" with ${opts.prizeSOL} SOL prize`,
      cost: opts.prizeSOL,
      metadata: { raffleId: raffle.id, torqueId },
    },
  });

  // WebSocket
  const io = (global as any).io;
  if (io) {
    io.emit("raffle:created", {
      raffleId: raffle.id,
      name: opts.name,
      prizeSOL: opts.prizeSOL,
      drawAt: drawAt.toISOString(),
      creatorAgent: { id: agent.id, name: agent.name },
    });
  }

  console.log(`[Raffle] Created: "${opts.name}" by ${agent.name} (${opts.prizeSOL} SOL)`);
  return raffle.id;
}

// ============================================================
// Grant Raffle Tickets
// ============================================================

export async function grantTickets(
  userId: string,
  raffleId: string,
  tickets: number
): Promise<void> {
  await prisma.raffleEntry.upsert({
    where: { raffleId_userId: { raffleId, userId } },
    create: { raffleId, userId, tickets },
    update: { tickets: { increment: tickets } },
  });

  const raffle = await prisma.raffle.findUnique({ where: { id: raffleId } });
  if (raffle?.torqueRaffleId) {
    await torqueClient.grantRaffleTickets(userId, raffle.torqueRaffleId, tickets);
  }

  await dispatchTorqueEvent({
    userId,
    eventType: "raffle_ticket_earned",
    metadata: { raffleId, tickets },
  });
}

// ============================================================
// Draw Raffle Winners
// ============================================================

export async function drawRaffle(raffleId: string): Promise<string | null> {
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    include: {
      entries: { include: { user: true } },
    },
  });

  if (!raffle || raffle.status !== "active") return null;

  const ticketPool: string[] = [];
  for (const entry of raffle.entries) {
    for (let i = 0; i < entry.tickets; i++) {
      ticketPool.push(entry.userId);
    }
  }

  if (ticketPool.length === 0) {
    await prisma.raffle.update({
      where: { id: raffleId },
      data: { status: "cancelled" },
    });
    return null;
  }

  const winnerIdx = Math.floor(Math.random() * ticketPool.length);
  const winnerId = ticketPool[winnerIdx];

  await prisma.raffle.update({
    where: { id: raffleId },
    data: { status: "drawn", winnerId },
  });

  await torqueClient.distributeReward(winnerId, "raffle_prize", raffle.prizeSOL, {
    raffleId,
    raffleName: raffle.name,
  });

  await dispatchTorqueEvent({
    userId: winnerId,
    eventType: "reward_claimed",
    metadata: {
      raffleId,
      raffleName: raffle.name,
      prizeSOL: raffle.prizeSOL,
      type: "raffle_winner",
    },
  });

  const io = (global as any).io;
  if (io) {
    io.emit("raffle:drawn", {
      raffleId,
      raffleName: raffle.name,
      winnerId,
      prizeSOL: raffle.prizeSOL,
    });
  }

  console.log(`[Raffle] Winner drawn for "${raffle.name}": ${winnerId}`);
  return winnerId;
}

// ============================================================
// Process Expired Raffles
// ============================================================

export async function processExpiredRaffles(): Promise<number> {
  const now = new Date();
  const expired = await prisma.raffle.findMany({
    where: { status: "active", drawAt: { lte: now } },
  });

  let processed = 0;
  for (const raffle of expired) {
    await drawRaffle(raffle.id);
    processed++;
  }

  return processed;
}
