import { Router } from "express";
import { auth as authenticate } from "../middleware/auth";
import { asyncHandler } from "../utils/asyncHandler";
import { dispatchTorqueEvent } from "../services/torque/eventDispatcher";
import { retryFailedTorqueEvents } from "../services/torque/eventDispatcher";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";

const router = Router();

// POST /api/torque/event — manually dispatch a Torque event
router.post("/event", authenticate, asyncHandler(async (req, res) => {
  const { eventType, agentId, metadata } = req.body;
  const userId = req.user!.id;

  if (!eventType) throw ApiError.badRequest("eventType required");

  await dispatchTorqueEvent({
    userId,
    agentId,
    eventType,
    metadata,
  });

  res.json({ success: true, message: "Event dispatched" });
}));

// GET /api/torque/events — list recent events for this user
router.get("/events", authenticate, asyncHandler(async (req, res) => {
  const events = await prisma.torqueEvent.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ success: true, data: events });
}));

// POST /api/torque/retry — retry failed events (admin)
router.post("/retry", authenticate, asyncHandler(async (req, res) => {
  const retried = await retryFailedTorqueEvents();
  res.json({ success: true, retried });
}));

export default router;
