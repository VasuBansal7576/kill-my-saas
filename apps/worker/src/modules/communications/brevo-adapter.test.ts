import { describe, expect, it, vi } from "vitest";
import { BrevoEmailAdapter, BrevoProviderError } from "./brevo-adapter";

describe("Brevo transactional adapter boundary", () => {
  it("records the real provider message ID and sends iCalendar as an attachment", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ messageId: "<provider-42@brevo>" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    const adapter = new BrevoEmailAdapter({ apiKey: "secret", senderEmail: "sender@example.com", senderName: "ProgramFlow", fetch: request });
    const result = await adapter.send({
      idempotencyKey: "recipient-attempt-1",
      to: { email: "priya@example.com", name: "Priya Raman" },
      subject: "Your session",
      html: "<p>Scheduled</p>",
      text: "Scheduled",
      attachment: { filename: "session.ics", contentType: "text/calendar", content: "BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n" },
    });

    expect(result.providerMessageId).toBe("<provider-42@brevo>");
    const init = request.mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(init.body));
    expect(payload.headers["Idempotency-Key"]).toBe("recipient-attempt-1");
    expect(payload.attachment[0].name).toBe("session.ics");
    expect(payload.attachment[0].content).toBeTypeOf("string");
  });

  it("surfaces provider rejection without claiming delivery", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: "unauthorized", message: "bad key" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }));
    const adapter = new BrevoEmailAdapter({ apiKey: "bad", senderEmail: "sender@example.com", senderName: "ProgramFlow", fetch: request });
    await expect(adapter.send({ idempotencyKey: "recipient-attempt-1", to: { email: "p@example.com", name: "P" }, subject: "S", html: "H", text: "T" }))
      .rejects.toEqual(expect.objectContaining<Partial<BrevoProviderError>>({ code: "unauthorized", retryable: false }));
  });
});
