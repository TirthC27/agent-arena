// ============================================================
// CRON JOB SCHEDULER — AGENT AUTONOMY DRIVEN
// All campaigns are created by agents, not static schedules
// ============================================================

import cron from "node-cron";
import { triggerAgentCampaignCreation, completeCampaigns } from "../services/campaignEngine";
import { refreshGlobalLeaderboard, refreshDomainLeaderboard, refreshWeeklyLeaderboard, refreshRisingStars } from "../services/leaderboardEngine";
import { runAutonomousTraining, regenerateEnergy } from "../services/trainingEngine";
import { retryFailedTorqueEvents } from "../services/torque/eventDispatcher";
import { runAutonomyOrchestrator, runStrategyEvolution, applyPersonalityDrift, compressAgentMemories } from "../services/agentAutonomyLoop";
import { prisma } from "./db";

// ============================================================
// Job Registry
// ============================================================

export function startCronJobs(): void {
  console.log("[Cron] Starting autonomous agent workers...");

  // ═══════════════════════════════════════════
  // AGENT AUTONOMY — The Core Loop
  // ═══════════════════════════════════════════

  // ─── Every 20 mins: Agent Decision Loop ─────────────────
  // Agents autonomously decide: create campaigns, join, challenge, train
  cron.schedule("*/20 * * * *", async () => {
    console.log("[Cron] 🤖 Running agent autonomy orchestrator...");
    try {
      await runAutonomyOrchestrator();
    } catch (err: any) {
      console.error("[Cron] Autonomy orchestrator failed:", err.message);
    }
  });

  // ─── Every 2 hours: Strategy Evolution ──────────────────
  // Agents rethink their strategy using GPT-4o
  cron.schedule("0 */2 * * *", async () => {
    console.log("[Cron] 🧠 Running strategy evolution...");
    try {
      await runStrategyEvolution();
    } catch (err: any) {
      console.error("[Cron] Strategy evolution failed:", err.message);
    }
  });

  // ─── Every 3 hours: Agent Campaign Creation ─────────────
  // Top agents analyze ecosystem and create campaigns via Torque
  cron.schedule("0 */3 * * *", async () => {
    console.log("[Cron] 🏟️ Triggering agent campaign creation...");
    try {
      const created = await triggerAgentCampaignCreation();
      if (created > 0) console.log(`[Cron] Agents created ${created} campaigns`);
    } catch (err: any) {
      console.error("[Cron] Agent campaign creation failed:", err.message);
    }
  });

  // ─── Every 6 hours: Personality Drift ───────────────────
  // Agent traits shift based on recent performance
  cron.schedule("0 */6 * * *", async () => {
    console.log("[Cron] 🎭 Applying personality drift...");
    try {
      await applyPersonalityDrift();
    } catch (err: any) {
      console.error("[Cron] Personality drift failed:", err.message);
    }
  });

  // ─── Daily at 3 AM: Memory Compression ─────────────────
  cron.schedule("0 3 * * *", async () => {
    console.log("[Cron] 🧹 Compressing agent memories...");
    try {
      await compressAgentMemories();
    } catch (err: any) {
      console.error("[Cron] Memory compression failed:", err.message);
    }
  });

  // ═══════════════════════════════════════════
  // PLATFORM OPERATIONS
  // ═══════════════════════════════════════════

  // ─── Every hour: Refresh leaderboards ───────────────────
  cron.schedule("0 * * * *", async () => {
    try {
      await refreshGlobalLeaderboard();
      await refreshWeeklyLeaderboard();
      await refreshRisingStars();
    } catch (err: any) {
      console.error("[Cron] Leaderboard refresh failed:", err.message);
    }
  });

  // ─── Every 30 mins: Domain leaderboards ─────────────────
  cron.schedule("*/30 * * * *", async () => {
    const domains = ["music", "coding", "strategy", "knowledge", "prediction", "social", "debate"];
    for (const domain of domains) {
      try {
        await refreshDomainLeaderboard(domain);
      } catch (err: any) {
        console.error(`[Cron] Domain leaderboard (${domain}) failed:`, err.message);
      }
    }
  });

  // ─── Every 15 mins: Auto-training ──────────────────────
  cron.schedule("*/15 * * * *", async () => {
    try {
      const trained = await runAutonomousTraining();
      if (trained > 0) console.log(`[Cron] Auto-trained ${trained} agents`);
    } catch (err: any) {
      console.error("[Cron] Auto-training failed:", err.message);
    }
  });

  // ─── Every hour: Energy regeneration ────────────────────
  cron.schedule("0 * * * *", async () => {
    try {
      await regenerateEnergy();
    } catch (err: any) {
      console.error("[Cron] Energy regen failed:", err.message);
    }
  });

  // ─── Every 5 mins: Complete expired campaigns ──────────
  cron.schedule("*/5 * * * *", async () => {
    try {
      const completed = await completeCampaigns();
      if (completed > 0) console.log(`[Cron] Completed ${completed} campaigns`);
    } catch (err: any) {
      console.error("[Cron] Campaign completion failed:", err.message);
    }
  });

  // ─── Every 10 mins: Retry failed Torque events ─────────
  cron.schedule("*/10 * * * *", async () => {
    try {
      const retried = await retryFailedTorqueEvents();
      if (retried > 0) console.log(`[Cron] Retried ${retried} Torque events`);
    } catch (err: any) {
      console.error("[Cron] Torque retry failed:", err.message);
    }
  });

  // ─── Every 2 hours: Cleanup stale battles ──────────────
  cron.schedule("0 */2 * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const { count } = await prisma.battle.updateMany({
        where: {
          status: { in: ["pending", "in_progress"] },
          createdAt: { lt: cutoff },
        },
        data: { status: "cancelled" },
      });
      if (count > 0) console.log(`[Cron] Cancelled ${count} stale battles`);
    } catch (err: any) {
      console.error("[Cron] Stale battle cleanup failed:", err.message);
    }
  });

  // ═══════════════════════════════════════════
  // STARTUP: Initial Agent Autonomy Kick
  // ═══════════════════════════════════════════

  setTimeout(async () => {
    try {
      console.log("[Cron] 🚀 Running startup autonomy...");

      await refreshGlobalLeaderboard();
      console.log("[Cron] ✓ Global leaderboard refreshed");

      // Trigger initial agent campaign creation
      const campaigns = await triggerAgentCampaignCreation();
      console.log(`[Cron] ✓ Agents created ${campaigns} campaigns on startup`);

      // Run initial autonomy loop
      await runAutonomyOrchestrator();
      console.log("[Cron] ✓ Initial autonomy loop complete");

      console.log("[Cron] Startup tasks completed ✓");
    } catch (err: any) {
      console.error("[Cron] Startup tasks failed:", err.message);
    }
  }, 8000);

  console.log("[Cron] All autonomous agent workers scheduled ✓");
}
