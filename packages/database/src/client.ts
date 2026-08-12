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

export function createDatabase(databaseUrl: string): Database {
  // Cloudflare may reuse a Worker isolate for unrelated requests, but native
  // I/O objects owned by a Neon pool cannot cross request boundaries. A
  // module-level cache therefore eventually fails with "Cannot perform I/O on
  // behalf of a different request." Keep each pool scoped to its invocation;
  // poolQueryViaFetch still lets Neon use its stateless HTTP transport.
  return createDatabaseConnection(databaseUrl);
}
