type ExecuteResultWithRows<T> = {
  rows: T[];
};

/**
 * Normalizes the raw result returned by Drizzle's supported PostgreSQL drivers.
 * Neon serverless returns a result object with `rows`, while postgres-js returns
 * the rows array directly.
 */
export function rowsFromExecuteResult<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (hasRows<T>(result)) return result.rows;
  throw new TypeError("Unsupported database execute result: expected an array or an object with rows.");
}

function hasRows<T>(result: unknown): result is ExecuteResultWithRows<T> {
  return typeof result === "object" && result !== null && "rows" in result && Array.isArray(result.rows);
}
