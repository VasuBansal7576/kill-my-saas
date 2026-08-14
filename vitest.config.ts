import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
