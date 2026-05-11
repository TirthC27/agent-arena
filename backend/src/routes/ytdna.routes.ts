import { Router } from "express";
import * as ytdnaController from "../controllers/ytdna.controller";
import { auth } from "../middleware/auth";

const router = Router();

// GET /api/ytdna/auth-url?agentId=xxx  — generate OAuth URL (auth required)
router.get("/auth-url", auth, ytdnaController.getAuthUrl);

// GET /api/ytdna/callback  — Google OAuth callback (no auth, uses state param)
router.get("/callback", ytdnaController.handleCallback);

// GET /api/ytdna/profile/:agentId  — get stored YT-DNA profile
router.get("/profile/:agentId", ytdnaController.getProfile);

export default router;
