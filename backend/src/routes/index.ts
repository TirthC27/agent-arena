import { Router } from "express";
import agentRoutes from "./agent.routes";
import authRoutes from "./auth.routes";
import battleRoutes from "./battle.routes";
import chatRoutes from "./chat.routes";
import leaderboardRoutes from "./leaderboard.routes";
import ytdnaRoutes from "./ytdna.routes";
import campaignRoutes from "./campaign.routes";
import trainingRoutes from "./training.routes";
import walletRoutes from "./wallet.routes";
import rewardRoutes from "./reward.routes";
import torqueRoutes from "./torque.routes";
import autonomyRoutes from "./autonomy.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/agent", agentRoutes);
router.use("/agents", agentRoutes);       // plural alias (frontend uses /api/agents/*)
router.use("/battle", battleRoutes);
router.use("/battles", battleRoutes);     // plural alias (legacy frontend paths)
router.use("/chat", chatRoutes);
router.use("/leaderboard", leaderboardRoutes);
router.use("/ytdna", ytdnaRoutes);
router.use("/campaign", campaignRoutes);
router.use("/campaigns", campaignRoutes); // plural alias
router.use("/training", trainingRoutes);
router.use("/wallet", walletRoutes);
router.use("/rewards", rewardRoutes);
router.use("/torque", torqueRoutes);
router.use("/autonomy", autonomyRoutes);

export default router;

