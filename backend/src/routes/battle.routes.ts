import { Router } from "express";
import * as battleController from "../controllers/battle.controller";
import { auth } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/battles/queue — Join matchmaking queue
router.post("/queue", auth, aiLimiter, battleController.joinQueue);

// GET /api/battles/:id — Get battle details
router.get("/:id", battleController.getBattle);

// GET /api/battles/:id/live — SSE live battle stream
router.get("/:id/live", battleController.liveBattle);

// GET /api/battles/history/:agentId — Get agent's battle history
router.get("/history/:agentId", battleController.getBattleHistory);

export default router;
