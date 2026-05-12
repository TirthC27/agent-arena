import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { trainAgent } from "../services/trainingEngine";
import { getAgentSkills } from "../services/skillEngine";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { SkillDomain } from "../services/skillEngine";

const router = Router();

// POST /api/training/train — train an agent
router.post("/train", authenticate, asyncHandler(async (req, res) => {
  const { agentId, domain } = req.body;
  const userId = req.user!.id;

  if (!agentId || !domain) throw ApiError.badRequest("agentId and domain required");

  // Verify ownership
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  const result = await trainAgent(agentId, userId, domain as SkillDomain, "user_initiated");

  res.json({ success: true, data: result });
}));

// GET /api/training/skills/:agentId — get agent skills
router.get("/skills/:agentId", asyncHandler(async (req, res) => {
  const skills = await getAgentSkills(req.params.agentId as string);
  res.json({ success: true, data: skills });
}));

// GET /api/training/history/:agentId — training history
router.get("/history/:agentId", asyncHandler(async (req, res) => {
  const sessions = await prisma.trainingSession.findMany({
    where: { agentId: req.params.agentId as string },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  res.json({ success: true, data: sessions });
}));

export default router;
