import { Router } from "express";
import authRoutes from "./auth.routes";
import agentRoutes from "./agent.routes";
import chatRoutes from "./chat.routes";
import battleRoutes from "./battle.routes";
import leaderboardRoutes from "./leaderboard.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/agents", agentRoutes);
router.use("/chat", chatRoutes);
router.use("/battles", battleRoutes);
router.use("/leaderboard", leaderboardRoutes);

export default router;
