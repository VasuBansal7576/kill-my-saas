import { describe, expect, it } from "vitest";
import { buildCommunicationHistoryPage, type CommunicationHistoryQueries } from "./service";

describe("communications history query budget", () => {
  it("uses one page query and one aggregate query regardless of retained history depth", async () => {
    let pageQueries = 0;
    let aggregateQueries = 0;
    const retained = Array.from({ length: 10_000 }, (_, index) => campaign(index));
    const queries: CommunicationHistoryQueries = {
      async listCampaigns(limit) {
        pageQueries += 1;
        return retained.slice(0, limit);
      },
      async countRecipientStatuses(communicationIds) {
        aggregateQueries += 1;
        return communicationIds.flatMap((communicationId) => [
          { communicationId, status: "delivered" as const, count: 4 },
          { communicationId, status: "failed" as const, count: 1 },
        ]);
      },
    };

    const page = await buildCommunicationHistoryPage({ eventSlug: "devflow-conf-2027", limit: 20 }, queries);

    expect(page.campaigns).toHaveLength(20);
    expect(page.pagination).toMatchObject({ limit: 20, hasMore: true });
    expect(page.campaigns[0]?.recipientCounts).toEqual({ delivered: 4, failed: 1 });
    expect({ pageQueries, aggregateQueries, totalQueries: pageQueries + aggregateQueries }).toEqual({
      pageQueries: 1,
      aggregateQueries: 1,
      totalQueries: 2,
    });
  });
});

function campaign(index: number) {
  return {
    id: crypto.randomUUID(),
    eventId: crypto.randomUUID(),
    templateId: null,
    name: `Campaign ${index}`,
    kind: "campaign" as const,
    status: "complete" as const,
    subjectTemplate: "Subject",
    htmlTemplate: "<p>Body</p>",
    textTemplate: "Body",
    audienceSnapshot: {},
    idempotencyKey: `campaign-${index}`,
    requestedByPersonId: null,
    scheduledFor: null,
    createdAt: new Date(Date.UTC(2027, 4, 10, 0, 0, 0, -index)),
    updatedAt: new Date(),
  };
}
