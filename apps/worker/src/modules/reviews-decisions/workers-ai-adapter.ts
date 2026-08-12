import { z } from "zod";
import type { ReviewAiPort } from "./types";

export interface WorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

const ModelOutputSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string().trim().min(20).max(5_000),
});

const WorkersAiResponseSchema = z.object({ response: z.string() });

export class WorkersAiReviewAdapter implements ReviewAiPort {
  readonly provider = "cloudflare_workers_ai";
  readonly model = "@cf/meta/llama-3.2-3b-instruct";
  readonly promptVersion = "review-triage-v1";

  constructor(private readonly binding: WorkersAiBinding) {}

  async assess(input: Parameters<ReviewAiPort["assess"]>[0]) {
    const scoringCriteria = input.criteria.filter((criterion) => criterion.type !== "free_text").map((criterion) => ({
      label: criterion.label,
      weight: criterion.weight,
      scale: criterion.type === "numeric"
        ? `${criterion.min} to ${criterion.max}`
        : criterion.options.map((option) => `${option.label}=${option.score}`).join(", "),
    }));
    const prompt = [
      "You are a first-pass conference proposal evaluator. Return JSON only.",
      "The numeric score must be from 0 to 100. Written reasoning must cite proposal evidence and uncertainty.",
      `Title: ${input.title}`,
      `Abstract: ${input.abstract}`,
      `Criteria: ${JSON.stringify(scoringCriteria)}`,
      'Response shape: {"score": number, "reasoning": string}',
    ].join("\n\n");
    const raw = await this.binding.run(this.model, {
      messages: [{ role: "user", content: prompt }],
      max_tokens: 700,
      temperature: 0,
    });
    const response = WorkersAiResponseSchema.parse(raw).response;
    const parsed = ModelOutputSchema.parse(JSON.parse(stripCodeFence(response)));
    return {
      provider: this.provider,
      model: this.model,
      promptVersion: this.promptVersion,
      ...parsed,
    };
  }
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}
