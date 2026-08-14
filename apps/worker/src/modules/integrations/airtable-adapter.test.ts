import { describe, expect, it, vi } from "vitest";
import { AirtableProviderError, AirtableRestAdapter } from "./airtable-adapter";

describe("Airtable REST boundary", () => {
  it("retains the global receiver when using the runtime fetch binding", async () => {
    const originalFetch = globalThis.fetch;
    const request = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(Response.json({ records: [] }));
    }) as unknown as typeof fetch;
    globalThis.fetch = request;

    try {
      const adapter = new AirtableRestAdapter({ token: "secret", minimumRequestIntervalMs: 0 });
      await expect(adapter.listPage({ baseId: "app_base", tableId: "Sessions", pageSize: 100 }))
        .resolves.toMatchObject({ records: [], requestCount: 1 });
      expect(request).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("follows provider pagination and preserves returned record IDs", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ records: [{ id: "rec_one", fields: { Name: "Priya" } }], offset: "next-page" }))
      .mockResolvedValueOnce(Response.json({ records: [{ id: "rec_two", fields: { Name: "Marcus" } }] }));
    const adapter = new AirtableRestAdapter({ token: "secret", fetch: request, minimumRequestIntervalMs: 0 });

    const first = await adapter.listPage({ baseId: "app_base", tableId: "Speakers", pageSize: 100 });
    const second = await adapter.listPage({ baseId: "app_base", tableId: "Speakers", pageSize: 100, offset: first.offset });

    expect(first).toMatchObject({ records: [{ id: "rec_one" }], offset: "next-page", requestCount: 1 });
    expect(second.records[0]?.id).toBe("rec_two");
    expect(String(request.mock.calls[1]?.[0])).toContain("offset=next-page");
    expect((request.mock.calls[0]?.[1]?.headers as Record<string, string>).authorization).toBe("Bearer secret");
  });

  it("honors rate-limit retry and reports the real attempt count", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { type: "RATE_LIMIT_REACHED", message: "slow down" } }, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(Response.json({ records: [{ id: "rec_created", fields: { Name: "Session" } }] }, { status: 200 }));
    const delay = vi.fn(async () => undefined);
    const adapter = new AirtableRestAdapter({ token: "secret", fetch: request, delay, minimumRequestIntervalMs: 0 });

    const result = await adapter.create({ baseId: "app_base", tableId: "Sessions", records: [{ fields: { Name: "Session" } }] });

    expect(result).toMatchObject({ records: [{ id: "rec_created" }], requestCount: 2 });
    expect(delay).toHaveBeenCalledWith(0);
  });

  it("surfaces non-retryable row rejection without inventing a success", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      error: { type: "UNKNOWN_FIELD_NAME", message: "Unknown field" },
    }, { status: 422 }));
    const adapter = new AirtableRestAdapter({ token: "secret", fetch: request, minimumRequestIntervalMs: 0 });

    await expect(adapter.update({ baseId: "app_base", tableId: "Sessions", records: [{ id: "rec_1", fields: { Missing: true } }] }))
      .rejects.toEqual(expect.objectContaining<Partial<AirtableProviderError>>({ code: "unknown_field_name", retryable: false }));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("retries transient network errors and never converts exhaustion into success", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("connection reset"));
    const delay = vi.fn(async () => undefined);
    const adapter = new AirtableRestAdapter({ token: "secret", fetch: request, delay, maxAttempts: 2, minimumRequestIntervalMs: 0 });

    await expect(adapter.listPage({ baseId: "app_base", tableId: "Sessions", pageSize: 100 }))
      .rejects.toEqual(expect.objectContaining<Partial<AirtableProviderError>>({ code: "network_error", retryable: true, metadata: { attempts: 2 } }));
    expect(request).toHaveBeenCalledTimes(2);
  });
});
