import { describe, expect, it } from "vitest";
import { CreateFileRequestSchema } from "./contracts";

describe("file request upload policy", () => {
  it("persists communicated allowlisted types and a bounded maximum size", () => {
    const valid = CreateFileRequestSchema.safeParse({
      title: "Upload Session Presentation",
      instructions: "Final slide deck as a PDF, 16:9 aspect ratio.",
      dueAt: "2027-05-01T23:59:00.000Z",
      eventSpeakerIds: ["d2f4a32e-8946-4c9d-a0a1-523d84e0f214"],
      acceptedMediaTypes: ["application/pdf"],
      maxByteSize: 100 * 1024 * 1024,
      handoff: "session_file",
      idempotencyKey: "slides-request-2027",
    });
    expect(valid.success).toBe(true);
    expect(CreateFileRequestSchema.safeParse({ ...(valid.success ? valid.data : {}), maxByteSize: 251 * 1024 * 1024 }).success).toBe(false);
    expect(CreateFileRequestSchema.safeParse({ ...(valid.success ? valid.data : {}), acceptedMediaTypes: ["text/html"] }).success).toBe(false);
  });
});
