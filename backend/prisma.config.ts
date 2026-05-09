// Prisma 7 configuration for Agent Arena
// Connection URLs are now configured here instead of schema.prisma
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Pooled connection via Supabase pgbouncer (port 6543)
    url: process.env["DATABASE_URL"],
    // Direct connection for migrations (port 5432)
    directUrl: process.env["DIRECT_URL"],
  },
});
