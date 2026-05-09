import { Router } from "express";
import * as chatController from "../controllers/chat.controller";
import { auth } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimiter";

const router = Router();

// POST /api/chat/:agentId — Send a message to your agent
router.post("/:agentId", auth, aiLimiter, chatController.sendMessage);

// GET /api/chat/:agentId/history — Get chat history
router.get("/:agentId/history", auth, chatController.getChatHistory);

export default router;
