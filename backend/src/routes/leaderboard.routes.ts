import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { getLeaderboard, LeaderboardType } from "../services/leaderboardEngine";

const router = Router();

// GET /api/leaderboard?type=global&limit=50
router.get("/", asyncHandler(async (req, res) => {
  const type = (req.query.type as LeaderboardType) || "global";
  const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);

  const entries = await getLeaderboard(type, limit);
  res.json({ success: true, data: entries, type, limit });
}));

// GET /api/leaderboard/types — list all leaderboard types
router.get("/types", asyncHandler(async (_req, res) => {
  const types: LeaderboardType[] = [
    "global",
    "domain_music",
    "domain_coding",
    "domain_strategy",
    "domain_knowledge",
    "domain_prediction",
    "domain_social",
    "domain_debate",
    "weekly",
    "monthly",
    "rising_stars",
    "win_streak",
    "highest_xp",
    "most_trained",
    "richest",
  ];
  res.json({ success: true, data: types });
}));

export default router;
