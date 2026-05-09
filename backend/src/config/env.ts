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

  // OpenRouter
  OPENROUTER_API_KEY: requireEnv("OPENROUTER_API_KEY"),
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  OPENROUTER_DEFAULT_MODEL: process.env.OPENROUTER_DEFAULT_MODEL || "anthropic/claude-sonnet-4",
  OPENROUTER_BATTLE_MODEL: process.env.OPENROUTER_BATTLE_MODEL || "anthropic/claude-sonnet-4",

  // Auth
  JWT_SECRET: requireEnv("JWT_SECRET"),
  JWT_EXPIRY: process.env.JWT_EXPIRY || "7d",

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || "100", 10),
  AI_RATE_LIMIT_MAX: parseInt(process.env.AI_RATE_LIMIT_MAX || "20", 10),
};
