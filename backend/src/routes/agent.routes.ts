import { Router } from "express";
import * as agentController from "../controllers/agent.controller";
import { auth } from "../middleware/auth";

const router = Router();

// POST /api/agents — Create a new agent (auth required)
router.post("/", auth, agentController.createAgent);

// GET /api/agents/my — Get current user's agents (auth required)
router.get("/my", auth, agentController.getMyAgents);

// GET /api/agents/:id — Get agent by ID (public)
router.get("/:id", agentController.getAgent);

// PATCH /api/agents/:id — Update an agent (auth required, owner only)
router.patch("/:id", auth, agentController.updateAgent);

// DELETE /api/agents/:id — Delete an agent (auth required, owner only)
router.delete("/:id", auth, agentController.deleteAgent);

export default router;
