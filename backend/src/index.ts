import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { requestLogger } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiter";
import routes from "./routes";

const app = express();

// ========== Global Middleware ==========
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);
app.use(globalLimiter);

// ========== Health Check ==========
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ========== API Routes ==========
app.use("/api", routes);

// ========== Error Handler (must be last) ==========
app.use(errorHandler);

// ========== Start Server ==========
app.listen(env.PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║      🏟️  Agent Arena Backend 🏟️      ║
  ║                                      ║
  ║   Running on port ${env.PORT}              ║
  ║   Environment: ${env.NODE_ENV}        ║
  ╚══════════════════════════════════════╝
  `);
});

export default app;
