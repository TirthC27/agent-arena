import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as battleService from "../services/battle.service";
import { prisma } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { schemas } from "../utils/validate";

export const joinQueue = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { agentId, category } = schemas.joinQueue.parse(req.body);

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
          txSignature: true,
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
