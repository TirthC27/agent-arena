import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as authService from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { schemas } from "../utils/validate";

export const getChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress } = schemas.challenge.parse(req.body);
  const challenge = await authService.generateChallenge(walletAddress);
  res.json({ success: true, data: challenge });
});

export const verify = asyncHandler(async (req: Request, res: Response) => {
  const { walletAddress, signature, message } = schemas.verify.parse(req.body);
  const result = await authService.verifyAndLogin(walletAddress, signature, message);
  res.json({ success: true, data: result });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ success: true, data: user });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    await authService.logout(token);
  }
  res.json({ success: true, data: { message: "Logged out" } });
});
