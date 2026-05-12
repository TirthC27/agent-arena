import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import { env } from "./config/env";
import { requestLogger } from "./middleware/logger";
import { errorHandler } from "./middleware/errorHandler";
import { globalLimiter } from "./middleware/rateLimiter";
import routes from "./routes";
import { startCronJobs } from "./config/cron";
import { checkSolanaHealth } from "./services/solana.service";

const app = express();
const httpServer = createServer(app);

// ========== WebSocket Server ==========
const io = new SocketServer(httpServer, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://localhost:3001",
      "https://agent-arena-chi-amber.vercel.app"
    ],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Attach io globally for services to emit events
(global as any).io = io;

io.on("connection", (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  socket.on("subscribe:leaderboard", (type: string) => {
    socket.join(`leaderboard:${type}`);
  });

  socket.on("subscribe:battle", (battleId: string) => {
    socket.join(`battle:${battleId}`);
  });

  socket.on("subscribe:campaign", (campaignId: string) => {
    socket.join(`campaign:${campaignId}`);
  });

  socket.on("subscribe:agent", (agentId: string) => {
    socket.join(`agent:${agentId}`);
  });

  socket.on("disconnect", () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ========== Global Middleware ==========
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL || "http://localhost:3000",
      "http://localhost:3000",
      "http://localhost:3001",
      "https://agent-arena-chi-amber.vercel.app"
    ],
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(requestLogger);
app.use(globalLimiter);

// ========== Health Check ==========
app.get("/health", async (_req, res) => {
  const solana = await checkSolanaHealth();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    solana,
    websocket: "active",
    version: "2.0.0",
  });
});

// ========== API Routes ==========
app.use("/api", routes);

// ========== Error Handler (must be last) ==========
app.use(errorHandler);

// ========== Start Server ==========
httpServer.listen(Number(env.PORT) || 8080, "0.0.0.0", () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║      🏟️  Agent Arena Backend v2.0 🏟️      ║
  ║                                          ║
  ║   HTTP + WebSocket on port ${env.PORT}         ║
  ║   Environment: ${env.NODE_ENV}            ║
  ║   Torque MCP: ${process.env.TORQUE_API_KEY ? "✓ configured" : "⚠ no API key"}      ║
  ║   Redis: ${process.env.REDIS_URL ? "✓ configured" : "⚠ in-memory fallback"}     ║
  ╚══════════════════════════════════════════╝
  `);

  // Start background jobs
  startCronJobs();
});

export { io };
export default app;
