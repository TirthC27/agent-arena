import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";

const router = Router();

// GET /api/rewards — list available rewards
router.get("/", asyncHandler(async (req, res) => {
  const rewards = await prisma.reward.findMany({
    where: {
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ success: true, data: rewards });
}));

// POST /api/rewards/claim — claim a reward
router.post("/claim", authenticate, asyncHandler(async (req, res) => {
  const { rewardId } = req.body;
  const userId = req.user!.id;

  if (!rewardId) throw ApiError.badRequest("rewardId required");

  const { validateRewardClaim } = await import("../services/antiCheat");
  await validateRewardClaim(userId, rewardId);

  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward) throw ApiError.notFound("Reward not found");

  // Create claim record
  const claim = await prisma.rewardClaim.create({
    data: { userId, rewardId },
  });

  // Apply XP reward
  if (reward.valueXP > 0) {
    const agent = await prisma.agent.findFirst({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
    if (agent) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { xp: { increment: reward.valueXP } },
      });
    }
  }

  const { dispatchTorqueEvent } = await import("../services/torque/eventDispatcher");
  await dispatchTorqueEvent({
    userId,
    eventType: "reward_claimed",
    metadata: { rewardId, rewardTitle: reward.title, valueXP: reward.valueXP },
  });

  res.json({
    success: true,
    data: {
      claimId: claim.id,
      reward: { title: reward.title, valueXP: reward.valueXP, valueSOL: reward.valueSOL },
    },
  });
}));

export default router;
