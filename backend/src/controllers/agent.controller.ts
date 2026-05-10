import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import * as agentService from "../services/agent.service";
import { ApiError } from "../utils/ApiError";
import { schemas } from "../utils/validate";

export const createAgent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = schemas.createAgent.parse(req.body);

  const agent = await agentService.createAgent(req.user.id, data);
  res.status(201).json({ success: true, data: agent });
});

export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const agent = await agentService.getAgentById(req.params.id as string);
  res.json({ success: true, data: agent });
});

export const getMyAgents = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const agents = await agentService.getUserAgents(req.user.id);
  res.json({ success: true, data: agents });
});

export const updateAgent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const data = schemas.updateAgent.parse(req.body);
  const agent = await agentService.updateAgent(req.params.id as string, req.user.id, data);
  res.json({ success: true, data: agent });
});
