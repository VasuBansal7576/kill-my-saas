import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  neonConfig.webSocketConstructor = WebSocket;
  neonConfig.poolQueryViaFetch = true;
  const client = new Pool({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 1_000,
    connectionTimeoutMillis: 10_000,
  });
  return drizzle({ client, schema });
}

export type Database = ReturnType<typeof createDatabase>;
