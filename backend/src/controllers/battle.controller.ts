import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as battleService from "../services/battle.service";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { BattleCategory } from "../types";

const VALID_CATEGORIES: BattleCategory[] = [
  "knowledge", "strategy", "productivity", "prediction", "social",
];

export const joinQueue = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { agentId, category } = req.body;
  if (!agentId || !category) throw ApiError.badRequest("agentId and category required");
  if (!VALID_CATEGORIES.includes(category)) {
    throw ApiError.badRequest(`Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  const result = await battleService.joinQueue(agentId, category, req.user.id);
  res.json({ success: true, data: result });
});

export const getBattle = asyncHandler(async (req: Request, res: Response) => {
  const battle = await battleService.getBattleById(req.params.id as string);
  res.json({ success: true, data: battle });
});

export const getBattleHistory = asyncHandler(async (req: Request, res: Response) => {
  const battles = await battleService.getAgentBattleHistory(req.params.agentId as string);
  res.json({ success: true, data: battles });
});

/**
 * SSE endpoint for live battle updates
 */
export const liveBattle = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const interval = setInterval(async () => {
    try {
      const battle = await prisma.battle.findUnique({
        where: { id },
        select: {
          status: true,
          score1: true,
          score2: true,
          winnerId: true,
          agent1Response: true,
          agent2Response: true,
          judgement: true,
        },
      });

      if (!battle) {
        clearInterval(interval);
        res.end();
        return;
      }

      res.write(`data: ${JSON.stringify(battle)}\n\n`);

      if (battle.status === "completed" || battle.status === "cancelled") {
        clearInterval(interval);
        res.end();
      }
    } catch {
      clearInterval(interval);
      res.end();
    }
  }, 1500);

  req.on("close", () => clearInterval(interval));
});
