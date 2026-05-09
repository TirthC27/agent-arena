import { Router } from "express";
import * as leaderboardController from "../controllers/leaderboard.controller";

const router = Router();

// GET /api/leaderboard — Global leaderboard
router.get("/", leaderboardController.getLeaderboard);

// GET /api/leaderboard/:category — Category-specific leaderboard
router.get("/:category", leaderboardController.getCategoryLeaderboard);

export default router;
