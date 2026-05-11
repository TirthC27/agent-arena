import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof ApiError) {
    console.error(`[API_ERROR] ${req.method} ${req.path}: ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  const prismaError = err as any;
  if (prismaError.code === "P1000") {
    console.error(`[DB_ERROR] Invalid database credentials:`, err);
    return res.status(503).json({
      success: false,
      error: "Database authentication failed. Check DATABASE_URL and DIRECT_URL credentials.",
    });
  }

  if (prismaError.code === "P1001") {
    console.error(`[DB_ERROR] Database unreachable:`, err);
    return res.status(503).json({
      success: false,
      error: "Database is unreachable. Check the database host, port, and network access.",
    });
  }

  // Prisma known errors
  if (prismaError.code === "P2002") {
    console.error(`[DB_ERROR] Unique constraint violation:`, err);
    return res.status(409).json({
      success: false,
      error: "A record with this value already exists",
    });
  }

  if (prismaError.code === "P2025") {
    console.error(`[DB_ERROR] Record not found:`, err);
    return res.status(404).json({
      success: false,
      error: "Record not found",
    });
  }

  // Solana/Anchor errors
  if (err.message?.includes("AnchorError") || err.message?.includes("Program log")) {
    console.error(`[SOLANA_ERROR] ${req.method} ${req.path}:`, err.message);
    if ((err as any).logs) {
      console.error(`[SOLANA_ERROR] Program logs:`, (err as any).logs);
    }
    return res.status(502).json({
      success: false,
      error: "Blockchain transaction failed. Please try again.",
    });
  }

  // OpenRouter / AI upstream errors
  if (err.message?.includes("All AI models failed") || err.message?.includes("Empty LLM response")) {
    console.error(`[AI_ERROR] ${req.method} ${req.path}:`, err.message);
    return res.status(503).json({
      success: false,
      error: "AI service temporarily unavailable. Please try again later.",
    });
  }

  // AbortError (timeout)
  if (err.name === "AbortError") {
    console.error(`[TIMEOUT_ERROR] ${req.method} ${req.path}: Request timed out`);
    return res.status(504).json({
      success: false,
      error: "Request timed out. Please try again.",
    });
  }

  // Unknown errors
  console.error(`[UNHANDLED_ERROR] ${req.method} ${req.path}:`, err);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
};
