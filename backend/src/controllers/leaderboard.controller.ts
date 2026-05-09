import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as leaderboardService from "../services/leaderboard.service";

export const getLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const leaderboard = await leaderboardService.getLeaderboard(undefined, limit);
  res.json({ success: true, data: leaderboard });
});

export const getCategoryLeaderboard = asyncHandler(async (req: Request, res: Response) => {
  const category = req.params.category as string;
  const limit = parseInt(req.query.limit as string) || 50;
  const leaderboard = await leaderboardService.getLeaderboard(category, limit);
  res.json({ success: true, data: leaderboard });
});
