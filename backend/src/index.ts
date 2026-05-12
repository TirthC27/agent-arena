import express from "express";
import { prisma } from "./config/db";
import { getRedis } from "./config/redis";
import cors from "cors";
import jwt from "jsonwebtoken";
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

const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:3000",
  "http://localhost:3000",
  "http://localhost:3001",
  "https://agent-arena-chi-amber.vercel.app"
];

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/agent-arena.*\.vercel\.app$/.test(origin)) return true;
  return false;
};

// ========== WebSocket Server ==========
const io = new SocketServer(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Optional WebSocket Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      socket.data.user = jwt.verify(token, env.JWT_SECRET);
    } catch {}
  }
  next();
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
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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
  ║      🏟️  Agent Arena Backend v2.0 🏟️    ║
  ║                                          ║
  ║   HTTP + WebSocket on port ${env.PORT}   ║
  ║   Environment: ${env.NODE_ENV}            ║
  ║   Torque MCP: ${process.env.TORQUE_API_KEY ? "✓ configured" : "⚠ no API key"}      ║
  ║   Redis: ${process.env.REDIS_URL ? "✓ configured" : "⚠ in-memory fallback"}     ║
  ╚══════════════════════════════════════════╝
  `);

  // Start background jobs
  startCronJobs();
});

// ========== Graceful Shutdown ==========
const shutdown = async (signal: string) => {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
  
  httpServer.close(() => {
    console.log("[Server] HTTP server closed.");
  });

  try {
    await prisma.$disconnect();
    console.log("[Database] Prisma disconnected.");
  } catch (err) {
    console.error("[Database] Error disconnecting Prisma:", err);
  }

  try {
    const redis = getRedis();
    if (redis.status !== "end") {
      await redis.quit();
      console.log("[Redis] Disconnected.");
    }
  } catch (err) {
    console.error("[Redis] Error disconnecting:", err);
  }

  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export { io };
export default app;
