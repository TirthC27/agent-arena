import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  PORT: parseInt(process.env.PORT || "3001", 10),
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database (handled by Prisma via DATABASE_URL)

  // Google OAuth (YouTube)
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/ytdna/callback",

  // Anthropic
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "",

  // OpenRouter
  OPENROUTER_API_KEY: requireEnv("OPENROUTER_API_KEY"),
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  OPENROUTER_DEFAULT_MODEL: process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-5.2-chat",
  OPENROUTER_BATTLE_MODEL: process.env.OPENROUTER_BATTLE_MODEL || "openai/gpt-5.2-chat",

  // Auth
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRY: process.env.JWT_EXPIRY || "7d",

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  AI_RATE_LIMIT_MAX: parseInt(process.env.AI_RATE_LIMIT_MAX || "20", 10),

  // Solana (optional — backend works without these, Solana features degrade gracefully)
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com",
  SOLANA_AUTHORITY_KEYPAIR: process.env.SOLANA_AUTHORITY_KEYPAIR || "[]",
  ANCHOR_PROGRAM_ID: process.env.ANCHOR_PROGRAM_ID || "AjEeXL7uxDbPp3EebeUH9g8uE59E66NHWuwYFUfS1n2L",

  // Torque MCP
  TORQUE_API_KEY: process.env.TORQUE_API_KEY || "",
  TORQUE_API_URL: process.env.TORQUE_API_URL || "https://api.torque.so",

  // Redis
  REDIS_URL: process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || "",

  // Frontend
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
};
