import type { AcceleventsEntity, AcceleventsProviderPort, AcceleventsProviderResult } from "./types";

export interface AcceleventsRestAdapterConfig {
  token: string;
  baseUrl?: string;
  authorizationHeader?: "Authorization" | "Key";
  fetch?: typeof fetch;
  delay?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
}

export class AcceleventsProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly metadata: { attempts: number; httpStatus?: number; requestId?: string } = { attempts: 1 },
  ) { super(message); }
}

/** Worker-only adapter for the documented Accelevents host speaker/session API. */
export class AcceleventsRestAdapter implements AcceleventsProviderPort {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;
  private readonly delay: (milliseconds: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(private readonly config: AcceleventsRestAdapterConfig) {
    this.request = config.fetch ?? fetch;
    this.baseUrl = (config.baseUrl ?? "https://api.accelevents.com").replace(/\/$/, "");
    this.delay = config.delay ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxAttempts = config.maxAttempts ?? 3;
  }

  async upsert(input: {
    eventUrl: string;
    entityType: AcceleventsEntity;
    externalId?: string;
    payload: Record<string, unknown>;
  }): Promise<AcceleventsProviderResult> {
    const operation = input.externalId ? "update" : "create";
    const path = `/rest/host/event/${encodeURIComponent(input.eventUrl)}/${input.entityType}${input.externalId ? `/${encodeURIComponent(input.externalId)}` : ""}`;
    const body = input.entityType === "speaker" && operation === "update" ? { speakerDTO: input.payload } : input.payload;
    const result = await this.requestJson(`${this.baseUrl}${path}`, {
      method: operation === "create" ? "POST" : "PUT",
      body: JSON.stringify(body),
    });
    const externalId = input.externalId ?? readCreatedId(result.body);
    if (!externalId) {
      throw new AcceleventsProviderError(
        "provider_id_missing",
        `Accelevents did not return an ID for the created ${input.entityType}.`,
        false,
        { attempts: result.attempts, httpStatus: result.status, requestId: result.requestId },
      );
    }
    return {
      externalId,
      operation,
      httpStatus: result.status,
      requestId: result.requestId,
      responseMetadata: { externalId, responseReceived: true },
      requestCount: result.attempts,
    };
  }

  private async requestJson(url: string, init: RequestInit) {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      try {
        response = await this.request(url, {
          ...init,
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            [this.config.authorizationHeader ?? "Authorization"]: this.config.token,
          },
        });
      } catch (error) {
        if (attempt === this.maxAttempts) {
          throw new AcceleventsProviderError("network_error", error instanceof Error ? error.message : "Accelevents request failed.", true, { attempts: attempt });
        }
        await this.delay(backoff(attempt));
        continue;
      }
      const body = await readBody(response);
      const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-correlation-id") ?? undefined;
      if (response.ok) return { body, status: response.status, attempts: attempt, requestId };
      const failure = providerFailure(response, body, attempt, requestId);
      if (!failure.retryable || attempt === this.maxAttempts) throw failure;
      await this.delay(retryAfter(response.headers.get("retry-after")) ?? backoff(attempt));
    }
    throw new AcceleventsProviderError("retry_exhausted", "Accelevents retries were exhausted.", true);
  }
}

function readCreatedId(body: unknown): string | undefined {
  if (typeof body === "number" || typeof body === "string") return String(body);
  if (!body || typeof body !== "object" || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  for (const key of ["id", "speakerId", "sessionId"]) {
    if (typeof record[key] === "number" || typeof record[key] === "string") return String(record[key]);
  }
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) return readCreatedId(record.data);
  return undefined;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

function providerFailure(response: Response, body: unknown, attempts: number, requestId?: string) {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const providerError = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : record;
  const rawCode = providerError.code ?? providerError.errorCode ?? `http_${response.status}`;
  const rawMessage = providerError.message ?? providerError.error ?? "Accelevents rejected the record.";
  return new AcceleventsProviderError(
    `accelevents_${String(rawCode).toLowerCase()}`,
    typeof rawMessage === "string" ? rawMessage : "Accelevents rejected the record.",
    response.status === 408 || response.status === 429 || response.status >= 500,
    { attempts, httpStatus: response.status, requestId },
  );
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function backoff(attempt: number) { return Math.min(300 * 2 ** (attempt - 1), 3_000); }
