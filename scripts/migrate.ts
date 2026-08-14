import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createToolingDatabase } from "../packages/database/src/tooling-client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to apply migrations.");
}

const { database, close } = createToolingDatabase(databaseUrl);
await migrate(database, { migrationsFolder: "packages/database/migrations" });
await close();
console.info("Database migrations applied.");
