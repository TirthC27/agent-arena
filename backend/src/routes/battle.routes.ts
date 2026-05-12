import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { auth as authenticate } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimiter";

import {
  joinQueue,
  leaveQueue,
  getBattleById,
  getAgentBattleHistory,
  getLiveBattles,
} from "../services/battle.service";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";

const router = Router();

// POST /api/battle/queue — join matchmaking queue
router.post("/queue", authenticate, aiLimiter, asyncHandler(async (req, res) => {
  const { agentId, category } = req.body;
  if (!agentId || !category) throw ApiError.badRequest("agentId and category required");

  const result = await joinQueue(agentId, category, req.user!.id);
  res.json({ success: true, data: result });
}));

// DELETE /api/battle/queue/:agentId — leave queue
router.delete("/queue/:agentId", authenticate, asyncHandler(async (req, res) => {
  leaveQueue(req.params.agentId as string);
  res.json({ success: true });
}));

// GET /api/battle/live — currently in-progress battles
router.get("/live", asyncHandler(async (_req, res) => {
  const battles = await getLiveBattles();
  res.json({ success: true, data: battles });
}));

// GET /api/battle/recent — recently completed battles
router.get("/recent", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || "10", 10), 50);
  const battles = await prisma.battle.findMany({
    where: { status: "completed" },
    orderBy: { completedAt: "desc" },
    take: limit,
    include: {
      agent1: { select: { id: true, name: true, avatarUrl: true, eloOverall: true } },
      agent2: { select: { id: true, name: true, avatarUrl: true, eloOverall: true } },
      winner: { select: { id: true, name: true } },
    },
  });
  res.json({ success: true, data: battles });
}));

// GET /api/battle/:id — get battle by ID
router.get("/:id", asyncHandler(async (req, res) => {
  const battle = await getBattleById(req.params.id as string);
  res.json({ success: true, data: battle });
}));

// GET /api/battle/history/:agentId — agent battle history
router.get("/history/:agentId", asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit as string || "20", 10);
  const history = await getAgentBattleHistory(req.params.agentId as string, limit);
  res.json({ success: true, data: history });
}));

export default router;
