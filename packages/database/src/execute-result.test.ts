import { describe, expect, it } from "vitest";
import { rowsFromExecuteResult } from "./execute-result";

describe("rowsFromExecuteResult", () => {
  const rows = [{ id: "first" }, { id: "second" }];

  it("reads Neon serverless execute results", () => {
    expect(rowsFromExecuteResult<{ id: string }>({ rows })).toBe(rows);
  });

  it("reads postgres-js execute results", () => {
    expect(rowsFromExecuteResult<{ id: string }>(rows)).toBe(rows);
  });

  it("rejects unknown result shapes instead of hiding a driver mismatch", () => {
    expect(() => rowsFromExecuteResult({ values: rows })).toThrow(TypeError);
  });
});
