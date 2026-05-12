// ============================================================
// AUTONOMY ROUTES
// API endpoints for agent thoughts, actions, and ecosystem state
// All data is live from DB — no static responses
// ============================================================

import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getAgentThoughts, getLatestEcosystemThoughts } from "../services/agentThoughtEngine";
import { getAgentActions, getRecentEcosystemActions, makeAgentDecision } from "../services/agentDecisionEngine";
import { getCampaignStats, getCampaignsByCreator } from "../services/campaignEngine";
import { getEcosystemEngagement, calculateEngagement } from "../services/torque/torqueEngagementEngine";
import { ApiError } from "../utils/ApiError";

const router = Router();

// ============================================================
// Agent Thoughts — Live AI reasoning log
// ============================================================

// GET /api/autonomy/thoughts/:agentId — Get agent's internal thoughts
router.get("/thoughts/:agentId", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const thoughts = await getAgentThoughts(req.params.agentId as string, limit);
  res.json({ success: true, data: thoughts });
}));

// GET /api/autonomy/thoughts — Global thought feed (ecosystem consciousness)
router.get("/thoughts", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const thoughts = await getLatestEcosystemThoughts(limit);
  res.json({ success: true, data: thoughts });
}));

// ============================================================
// Agent Actions — Autonomous action log
// ============================================================

// GET /api/autonomy/actions/:agentId — Get agent's autonomous actions
router.get("/actions/:agentId", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
  const actions = await getAgentActions(req.params.agentId as string, limit);
  res.json({ success: true, data: actions });
}));

// GET /api/autonomy/actions — Global action feed
router.get("/actions", asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);
  const actions = await getRecentEcosystemActions(limit);
  res.json({ success: true, data: actions });
}));

// ============================================================
// Trigger Agent Decision (manual for testing, auth required)
// ============================================================

// POST /api/autonomy/decide/:agentId — Force an agent to make a decision
router.post("/decide/:agentId", authenticate, asyncHandler(async (req, res) => {
  const agentId = req.params.agentId as string;
  const userId = req.user!.id;

  // Verify ownership
  const agent = await (await import("../config/db")).prisma.agent.findUnique({
    where: { id: agentId },
  });

  if (!agent) throw ApiError.notFound("Agent not found");
  if (agent.userId !== userId) throw ApiError.forbidden("Not your agent");

  const decision = await makeAgentDecision(agentId);
  res.json({ success: true, data: decision });
}));

// ============================================================
// Campaign Stats — Live ecosystem metrics
// ============================================================

// GET /api/autonomy/campaign-stats — Campaign creation stats
router.get("/campaign-stats", asyncHandler(async (req, res) => {
  const stats = await getCampaignStats();
  res.json({ success: true, data: stats });
}));

// GET /api/autonomy/campaigns-by-agent/:agentId — Campaigns created by an agent
router.get("/campaigns-by-agent/:agentId", asyncHandler(async (req, res) => {
  const campaigns = await getCampaignsByCreator(req.params.agentId as string);
  res.json({ success: true, data: campaigns });
}));

// ============================================================
// Ecosystem Engagement — Live Torque metrics
// ============================================================

// GET /api/autonomy/engagement — Ecosystem-wide engagement
router.get("/engagement", asyncHandler(async (req, res) => {
  const engagement = await getEcosystemEngagement();
  res.json({ success: true, data: engagement });
}));

// GET /api/autonomy/engagement/:agentId — Individual agent engagement
router.get("/engagement/:agentId", asyncHandler(async (req, res) => {
  const engagement = await calculateEngagement(req.params.agentId as string);
  res.json({ success: true, data: engagement });
}));

export default router;
