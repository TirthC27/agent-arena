import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";

import {
  getActiveCampaigns,
  getCampaignById,
  joinCampaign,
  getCampaignStats,
} from "../services/campaignEngine";
import { onCampaignJoined } from "../services/torque/eventDispatcher";
import { ApiError } from "../utils/ApiError";

const router = Router();

// GET /api/campaign — list active campaigns (all from DB, agent-created)
router.get("/", asyncHandler(async (req, res) => {
  const campaigns = await getActiveCampaigns();
  res.json({ success: true, data: campaigns });
}));

// GET /api/campaign/stats — campaign ecosystem stats
router.get("/stats", asyncHandler(async (req, res) => {
  const stats = await getCampaignStats();
  res.json({ success: true, data: stats });
}));

// GET /api/campaign/:id — campaign details + leaderboard
router.get("/:id", asyncHandler(async (req, res) => {
  const campaign = await getCampaignById(req.params.id as string);
  if (!campaign) throw ApiError.notFound("Campaign not found");
  res.json({ success: true, data: campaign });
}));

// POST /api/campaign/join — join a campaign
router.post("/join", authenticate, asyncHandler(async (req, res) => {
  const { campaignId, agentId } = req.body;
  const userId = req.user!.id;

  if (!campaignId || !agentId) throw ApiError.badRequest("campaignId and agentId required");

  const entry = await joinCampaign(campaignId, agentId, userId);

  // Fire Torque event
  const campaign = await getCampaignById(campaignId);
  if (campaign) {
    await onCampaignJoined(userId, agentId, campaignId, campaign.name);
  }

  res.json({ success: true, data: entry });
}));

export default router;
