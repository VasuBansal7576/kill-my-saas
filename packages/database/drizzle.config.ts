import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/database/src/schema/index.ts",
  out: "./packages/database/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://programflow:programflow@localhost:5432/programflow",
  },
  strict: true,
  verbose: true,
});

