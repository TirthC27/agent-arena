import rateLimit from "express-rate-limit";
import { env } from "../config/env";

// Global rate limiter for all routes
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  message: { success: false, error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for AI-powered endpoints (chat, battles)
export const aiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AI_RATE_LIMIT_MAX,
  message: { success: false, error: "AI rate limit reached, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints limiter
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many auth attempts" },
});
