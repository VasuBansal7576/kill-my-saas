export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: string;
}

export interface EmailSendInput {
  idempotencyKey: string;
  to: { email: string; name: string };
  subject: string;
  html: string;
  text: string;
  attachment?: EmailAttachment;
}

export interface ProviderOutcome {
  providerEventId: string;
  providerMessageId: string;
  eventType: string;
  occurredAt: Date;
  reason?: string;
  metadata: Record<string, unknown>;
}

export interface EmailProviderPort {
  readonly provider: "brevo";
  send(input: EmailSendInput): Promise<{ providerMessageId: string; acceptedAt: Date; metadata: Record<string, unknown> }>;
  poll(providerMessageId: string): Promise<ProviderOutcome[]>;
}

export class BrevoProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export interface BrevoAdapterConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
}

export class BrevoEmailAdapter implements EmailProviderPort {
  readonly provider = "brevo" as const;
  private readonly request: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly config: BrevoAdapterConfig) {
    this.request = config.fetch ?? fetch;
    this.baseUrl = (config.apiBaseUrl ?? "https://api.brevo.com/v3").replace(/\/$/, "");
  }

  async send(input: EmailSendInput) {
    const response = await this.request(`${this.baseUrl}/smtp/email`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: this.config.senderEmail, name: this.config.senderName },
        to: [{ email: input.to.email, name: input.to.name }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
        headers: { "Idempotency-Key": input.idempotencyKey },
        tags: ["programflow"],
        attachment: input.attachment ? [{
          name: input.attachment.filename,
          content: encodeBase64(input.attachment.content),
        }] : undefined,
      }),
    });
    const body = await readJson(response);
    if (!response.ok) throw providerFailure(response.status, body);
    const providerMessageId = typeof body.messageId === "string" ? body.messageId : undefined;
    if (!providerMessageId) throw new BrevoProviderError("invalid_provider_response", "Brevo accepted the request without a message ID.", true, { status: response.status });
    return { providerMessageId, acceptedAt: new Date(), metadata: { httpStatus: response.status } };
  }

  async poll(providerMessageId: string): Promise<ProviderOutcome[]> {
    const url = new URL(`${this.baseUrl}/smtp/statistics/events`);
    url.searchParams.set("messageId", providerMessageId);
    url.searchParams.set("limit", "100");
    url.searchParams.set("sort", "asc");
    const response = await this.request(url, { headers: { accept: "application/json", "api-key": this.config.apiKey } });
    const body = await readJson(response);
    if (!response.ok) throw providerFailure(response.status, body);
    if (!Array.isArray(body.events)) return [];
    return body.events.flatMap((candidate, index) => {
      if (typeof candidate !== "object" || candidate === null) return [];
      const event = candidate as Record<string, unknown>;
      if (typeof event.event !== "string") return [];
      const messageId = typeof event.messageId === "string" ? event.messageId : providerMessageId;
      const date = typeof event.date === "string" ? new Date(event.date) : new Date();
      return [{
        providerEventId: `${messageId}:${event.event}:${Number.isNaN(date.getTime()) ? index : date.toISOString()}`,
        providerMessageId: messageId,
        eventType: event.event,
        occurredAt: Number.isNaN(date.getTime()) ? new Date() : date,
        reason: typeof event.reason === "string" ? event.reason : undefined,
        metadata: pickMetadata(event, ["from", "tag", "templateId"]),
      }];
    });
  }
}

function providerFailure(status: number, body: Record<string, unknown>): BrevoProviderError {
  const code = typeof body.code === "string" ? body.code : `brevo_http_${status}`;
  const message = typeof body.message === "string" ? body.message : "Brevo rejected the transactional email request.";
  return new BrevoProviderError(code, message, status === 408 || status === 429 || status >= 500, { httpStatus: status });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function pickMetadata(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.flatMap((key) => source[key] === undefined ? [] : [[key, source[key]]]));
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}
