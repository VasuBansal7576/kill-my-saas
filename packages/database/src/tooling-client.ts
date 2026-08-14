import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export function createToolingDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1 });
  return {
    database: drizzle(client, { schema }),
    close: () => client.end(),
  };
}

