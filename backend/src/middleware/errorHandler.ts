import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const prismaError = err as { code?: string };

  if (err instanceof ApiError) {
    console.error(`[API_ERROR] ${req.method} ${req.path}: ${err.message}`);
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

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

  // Unknown errors
  console.error(`[UNHANDLED_ERROR] ${req.method} ${req.path}:`, err);
  return res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
};
