import { describe, expect, it } from "vitest";
import { WorkersAiReviewAdapter } from "./workers-ai-adapter";

describe("Workers AI review adapter", () => {
  it("persists only a provider-shaped numeric score with substantive written reasoning", async () => {
    const adapter = new WorkersAiReviewAdapter({
      async run() { return { response: '{"score":82,"reasoning":"The proposal gives concrete production evidence, while the evaluation method remains underspecified."}' }; },
    });
    const result = await adapter.assess({
      submissionId: "submission-a",
      title: "Reliable agent evaluation",
      abstract: "A field report covering production agent evaluation.",
      criteria: [{ key: "depth", label: "Technical depth", type: "numeric", required: true, weight: 100, min: 1, max: 5 }],
    });
    expect(result).toMatchObject({ provider: "cloudflare_workers_ai", score: 82 });
    expect(result.reasoning.length).toBeGreaterThan(20);
  });

  it("rejects malformed provider output instead of manufacturing a fallback score", async () => {
    const adapter = new WorkersAiReviewAdapter({ async run() { return { response: "Looks good" }; } });
    await expect(adapter.assess({ submissionId: "s", title: "T", abstract: "A", criteria: [] })).rejects.toThrow();
  });
});
