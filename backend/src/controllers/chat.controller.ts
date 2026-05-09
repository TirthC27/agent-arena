import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as chatService from "../services/chat.service";
import { ApiError } from "../utils/ApiError";

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { content } = req.body;
  if (!content) throw ApiError.badRequest("content is required");

  const result = await chatService.sendMessage(
    req.params.agentId as string,
    req.user.id,
    content
  );

  res.json({ success: true, data: result });
});

export const getChatHistory = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const limit = parseInt(req.query.limit as string) || 50;

  const messages = await chatService.getChatHistory(
    req.params.agentId as string,
    req.user.id,
    limit
  );

  res.json({ success: true, data: messages });
});
