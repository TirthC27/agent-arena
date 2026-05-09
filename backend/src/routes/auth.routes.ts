import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { authLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/auth/challenge — Get a message to sign
router.post("/challenge", authLimiter, authController.getChallenge);

// POST /api/auth/verify — Verify signature and get JWT
router.post("/verify", authLimiter, authController.verify);

// GET /api/auth/me — Get current user (requires auth)
import { auth } from "../middleware/auth";
router.get("/me", auth, authController.getMe);

export default router;
