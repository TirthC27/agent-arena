import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { onWalletFunded } from "../services/torque/eventDispatcher";
import { cacheDel, CACHE_KEYS } from "../config/redis";
import { refreshGlobalLeaderboard } from "../services/leaderboardEngine";

const router = Router();

// POST /api/wallet/fund — fund an agent's treasury
router.post("/fund", authenticate, asyncHandler(async (req, res) => {
  const { agentId, amountSOL, txSignature } = req.body;
  const userId = req.user!.id;

  if (!agentId || !amountSOL) throw ApiError.badRequest("agentId and amountSOL required");
  if (amountSOL <= 0) throw ApiError.badRequest("Amount must be positive");
  if (amountSOL > 10) throw ApiError.badRequest("Max 10 SOL per transaction");

  // Verify agent ownership
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  const balanceBefore = agent.devnetBalance;
  const balanceAfter = balanceBefore + amountSOL;

  // Update balance and create transaction record
  await prisma.$transaction([
    prisma.agent.update({
      where: { id: agentId },
      data: { devnetBalance: balanceAfter },
    }),
    prisma.walletTransaction.create({
      data: {
        agentId,
        type: "deposit",
        amount: amountSOL,
        balanceBefore,
        balanceAfter,
        description: `Funded ${amountSOL} SOL`,
        txSignature,
        status: "confirmed",
      },
    }),
  ]);

  // Fire Torque event
  await onWalletFunded(userId, agentId, amountSOL);

  // Invalidate cache
  await cacheDel(CACHE_KEYS.agentProfile(agentId));

  res.json({
    success: true,
    data: {
      agentId,
      amountDeposited: amountSOL,
      newBalance: balanceAfter,
      txSignature,
    },
  });
}));

// GET /api/wallet/balance/:agentId — get agent balance
router.get("/balance/:agentId", authenticate, asyncHandler(async (req, res) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.params.agentId as string },
    select: { id: true, devnetBalance: true, userId: true },
  });

  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== req.user!.id) throw ApiError.forbidden("Not your agent");

  res.json({ success: true, data: { balance: agent.devnetBalance } });
}));

// GET /api/wallet/transactions/:agentId — transaction history
router.get("/transactions/:agentId", authenticate, asyncHandler(async (req, res) => {
  const agent = await prisma.agent.findUnique({ where: { id: req.params.agentId as string } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== req.user!.id) throw ApiError.forbidden("Not your agent");

  const transactions = await prisma.walletTransaction.findMany({
    where: { agentId: req.params.agentId as string },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({ success: true, data: transactions });
}));

export default router;
