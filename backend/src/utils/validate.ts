import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import { ApiError } from "./ApiError";

/**
 * Validate request body against a Zod schema.
 * Returns a middleware that parses req.body and replaces it with the validated data.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw ApiError.badRequest(`Validation failed: ${message}`);
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate request query params against a Zod schema.
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw ApiError.badRequest(`Query validation failed: ${message}`);
    }
    req.query = result.data as any;
    next();
  };
}

// ========== Reusable Schemas ==========

export const schemas = {
  // Auth
  challenge: z.object({
    walletAddress: z.string().min(32).max(44),
  }),
  verify: z.object({
    walletAddress: z.string().min(32).max(44),
    signature: z.string().min(1),
    message: z.string().min(1),
  }),

  // Agent
  createAgent: z.object({
    name: z.string().min(1).max(32, "Agent name must be 32 characters or fewer"),
    bio: z.string().max(500).optional(),
    avatarUrl: z.string().url().optional(),
  }),
  updateAgent: z.object({
    name: z.string().min(1).max(32).optional(),
    bio: z.string().max(500).optional(),
    avatarUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
  }),

  // Battle
  joinQueue: z.object({
    agentId: z.string().min(1),
    category: z.enum(["knowledge", "strategy", "productivity", "prediction", "social"]),
  }),

  // Chat
  sendMessage: z.object({
    content: z.string().min(1).max(2000, "Message must be 2000 characters or fewer"),
  }),
};
