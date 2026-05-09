import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as authService from "../services/auth.service";
import { ApiError } from "../utils/ApiError";

export const getChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress } = req.body;
  if (!walletAddress) throw ApiError.badRequest("walletAddress is required");

  const challenge = await authService.generateChallenge(walletAddress);
  res.json({ success: true, data: challenge });
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress, signature, message } = req.body;
  if (!walletAddress || !signature || !message) {
    throw ApiError.badRequest("walletAddress, signature, and message are required");
  }

  const result = await authService.verifyAndLogin(walletAddress, signature, message);
  res.json({ success: true, data: result });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ success: true, data: user });
});
