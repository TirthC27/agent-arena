import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as ytdnaService from "../services/ytdna.service";
import { ApiError } from "../utils/ApiError";

/**
 * GET /api/ytdna/auth-url?agentId=xxx
 * Returns the Google OAuth consent URL for YouTube access.
 */
export const getAuthUrl = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { agentId } = req.query as { agentId?: string };
  if (!agentId) throw ApiError.badRequest("agentId query param is required");

  const url = ytdnaService.getAuthUrl(agentId, req.user.id);
  res.json({ success: true, data: { url } });
});

/**
 * GET /api/ytdna/callback?code=xxx&state=xxx
 * OAuth callback — exchanges code, runs pipeline, saves profile.
 * Redirects to frontend with result.
 */
export const handleCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

  if (error) {
    return res.redirect(`${FRONTEND_URL}/yt-dna?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/yt-dna?error=missing_params`);
  }

  let agentId: string;
  let userId: string;

  try {
    const parsed = JSON.parse(state);
    agentId = parsed.agentId;
    userId = parsed.userId;
  } catch {
    return res.redirect(`${FRONTEND_URL}/yt-dna?error=invalid_state`);
  }

  try {
    const profile = await ytdnaService.runYtDnaPipeline(code, agentId, userId);
    return res.redirect(
      `${FRONTEND_URL}/yt-dna/result?agentId=${agentId}&archetype=${encodeURIComponent(profile.agent.name)}&success=1`
    );
  } catch (err: any) {
    console.error("[YT-DNA] Pipeline error:", err);
    return res.redirect(
      `${FRONTEND_URL}/yt-dna?error=${encodeURIComponent(err.message || "pipeline_failed")}&agentId=${agentId}`
    );
  }
});

/**
 * GET /api/ytdna/profile/:agentId
 * Returns the stored YT-DNA profile for an agent.
 */
export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const { agentId } = req.params as { agentId: string };
  const profile = await ytdnaService.getYtDnaProfile(agentId);
  if (!profile) throw ApiError.notFound("YT-DNA profile not found for this agent");
  res.json({ success: true, data: profile });
});
