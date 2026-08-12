import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

function createDatabaseConnection(databaseUrl: string) {
  neonConfig.webSocketConstructor = WebSocket;
  neonConfig.poolQueryViaFetch = true;
  const client = new Pool({
    connectionString: databaseUrl,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDatabaseConnection>;

const workerDatabaseCache = new Map<string, Database>();

export function createDatabase(databaseUrl: string): Database {
  const existing = workerDatabaseCache.get(databaseUrl);
  if (existing) return existing;
  const database = createDatabaseConnection(databaseUrl);
  workerDatabaseCache.set(databaseUrl, database);
  if (workerDatabaseCache.size > 4) {
    const oldest = workerDatabaseCache.keys().next().value as string | undefined;
    if (oldest) workerDatabaseCache.delete(oldest);
  }
  return database;
}
