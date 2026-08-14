import type { AirtableMutation, AirtableProviderPort, AirtableRecord, AirtableUpdateMutation } from "./types";

export class AirtableProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface AirtableAdapterConfig {
  token: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
  minimumRequestIntervalMs?: number;
}

/** Real Airtable REST boundary. It never invents record IDs or successful responses. */
export class AirtableRestAdapter implements AirtableProviderPort {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly maxAttempts: number;
  private readonly minimumRequestIntervalMs: number;
  private lastRequestAt = 0;

  constructor(private readonly config: AirtableAdapterConfig) {
    // Cloudflare's native fetch is a host method and must retain its global
    // receiver. Storing the bare function produces an "Illegal invocation"
    // before any provider request leaves the Worker.
    this.request = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.baseUrl = (config.apiBaseUrl ?? "https://api.airtable.com/v0").replace(/\/$/, "");
    this.delay = config.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxAttempts = config.maxAttempts ?? 4;
    this.minimumRequestIntervalMs = config.minimumRequestIntervalMs ?? 210;
  }

  async listPage(input: { baseId: string; tableId: string; offset?: string; pageSize: number }) {
    const url = new URL(this.tableUrl(input.baseId, input.tableId));
    url.searchParams.set("pageSize", String(Math.max(1, Math.min(100, input.pageSize))));
    if (input.offset) url.searchParams.set("offset", input.offset);
    const result = await this.requestJson(url, { method: "GET" });
    try {
      return {
        records: parseRecords(result.body),
        offset: typeof result.body.offset === "string" ? result.body.offset : undefined,
        requestCount: result.attempts,
      };
    } catch (error) {
      throw responseShapeFailure(error, result.status, result.attempts);
    }
  }

  async create(input: { baseId: string; tableId: string; records: AirtableMutation[] }) {
    return this.mutate("POST", input.baseId, input.tableId, input.records);
  }

  async update(input: { baseId: string; tableId: string; records: AirtableUpdateMutation[] }) {
    return this.mutate("PATCH", input.baseId, input.tableId, input.records);
  }

  private async mutate(method: "POST" | "PATCH", baseId: string, tableId: string, records: Array<AirtableMutation | AirtableUpdateMutation>) {
    if (records.length < 1 || records.length > 10) {
      throw new AirtableProviderError("invalid_batch_size", "Airtable mutations require between one and ten records.", false);
    }
    const result = await this.requestJson(this.tableUrl(baseId, tableId), {
      method,
      body: JSON.stringify({ records, typecast: false }),
    });
    let parsed: AirtableRecord[];
    try {
      parsed = parseRecords(result.body);
    } catch (error) {
      throw responseShapeFailure(error, result.status, result.attempts);
    }
    if (parsed.length !== records.length) {
      throw new AirtableProviderError("invalid_provider_response", "Airtable returned a different record count than requested.", true, {
        expected: records.length,
        received: parsed.length,
        httpStatus: result.status,
      });
    }
    return { records: parsed, requestCount: result.attempts };
  }

  private tableUrl(baseId: string, tableId: string) {
    return `${this.baseUrl}/${encodeURIComponent(baseId)}/${encodeURIComponent(tableId)}`;
  }

  private async requestJson(url: string | URL, init: RequestInit) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      await this.throttle();
      let response: Response;
      try {
        response = await this.request(url, {
          ...init,
          headers: {
            authorization: `Bearer ${this.config.token}`,
            accept: "application/json",
            "content-type": "application/json",
            ...init.headers,
          },
        });
      } catch (error) {
        if (attempt === this.maxAttempts) {
          throw new AirtableProviderError("network_error", error instanceof Error ? error.message : "Airtable network request failed.", true, { attempts: attempt });
        }
        await this.delay(Math.min(250 * 2 ** (attempt - 1), 4_000));
        continue;
      }
      this.lastRequestAt = Date.now();
      const body = await readJson(response);
      if (response.ok) return { body, attempts: attempt, status: response.status };
      const error = providerFailure(response, body);
      if (!error.retryable || attempt === this.maxAttempts) {
        throw new AirtableProviderError(error.code, error.message, error.retryable, { ...error.metadata, attempts: attempt });
      }
      const retryAfter = retryAfterMilliseconds(response.headers.get("retry-after"));
      await this.delay(retryAfter ?? Math.min(250 * 2 ** (attempt - 1), 4_000));
    }
    throw new AirtableProviderError("retry_exhausted", "Airtable request retries were exhausted.", true);
  }

  private async throttle() {
    const remaining = this.minimumRequestIntervalMs - (Date.now() - this.lastRequestAt);
    if (this.lastRequestAt && remaining > 0) await this.delay(remaining);
  }
}

function parseRecords(body: Record<string, unknown>): AirtableRecord[] {
  if (!Array.isArray(body.records)) {
    throw new AirtableProviderError("invalid_provider_response", "Airtable response did not contain a records array.", true);
  }
  return body.records.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new AirtableProviderError("invalid_provider_response", "Airtable returned an invalid record.", true);
    }
    const record = candidate as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.fields || typeof record.fields !== "object" || Array.isArray(record.fields)) {
      throw new AirtableProviderError("invalid_provider_response", "Airtable record is missing its ID or fields.", true);
    }
    return {
      id: record.id,
      fields: record.fields as Record<string, unknown>,
      createdTime: typeof record.createdTime === "string" ? record.createdTime : undefined,
    };
  });
}

function providerFailure(response: Response, body: Record<string, unknown>) {
  const providerError = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
  const code = typeof providerError.type === "string" ? providerError.type.toLowerCase() : `airtable_http_${response.status}`;
  const message = typeof providerError.message === "string" ? providerError.message : "Airtable rejected the synchronization request.";
  return new AirtableProviderError(code, message, response.status === 408 || response.status === 429 || response.status >= 500, {
    httpStatus: response.status,
    requestId: response.headers.get("x-airtable-request-id") ?? undefined,
  });
}

function retryAfterMilliseconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function responseShapeFailure(error: unknown, status: number, attempts: number): AirtableProviderError {
  if (error instanceof AirtableProviderError) {
    return new AirtableProviderError(error.code, error.message, error.retryable, { ...error.metadata, httpStatus: status, attempts });
  }
  return new AirtableProviderError("invalid_provider_response", "Airtable returned an unreadable response.", true, { httpStatus: status, attempts });
}
