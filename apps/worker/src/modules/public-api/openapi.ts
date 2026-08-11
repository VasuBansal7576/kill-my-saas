const jsonContent = (schema: Record<string, unknown>, example?: unknown) => ({
  "application/json": { schema, ...(example === undefined ? {} : { example }) },
});

const response = (description: string, schema: Record<string, unknown>, example?: unknown) => ({
  description,
  content: jsonContent(schema, example),
});

const parameter = (
  name: string,
  location: "path" | "query" | "header",
  description: string,
  schema: Record<string, unknown>,
  required = false,
) => ({ name, in: location, description, required, schema });

const eventSlug = parameter("eventSlug", "path", "Stable public event slug.", { type: "string", example: "devflow-conf-2027" }, true);
const limit = parameter("limit", "query", "Page size. Defaults to 25 and is capped at 100.", { type: "integer", minimum: 1, maximum: 100, default: 25 });
const cursor = parameter("cursor", "query", "Opaque nextCursor from the preceding response. Cursors are bound to the publication revision and filters.", { type: "string" });
const catalogFilter = (name: string) => parameter(name, "query", `Exact ${name} ID or case-insensitive name.`, { type: "string" });

const standardResponses = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "404": { $ref: "#/components/responses/NotFound" },
  "409": { $ref: "#/components/responses/PublicationPaused" },
  "503": { $ref: "#/components/responses/Unavailable" },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "ProgramFlow Public Developer API",
    version: "1.0.0",
    summary: "Read-only access to canonical live conference programs.",
    description: "Anonymous JSON endpoints expose only live, approved, scheduled program data. There are no organizer writes or API-key claims in this contract.",
  },
  servers: [{ url: "/", description: "Current ProgramFlow origin" }],
  security: [],
  tags: [
    { name: "System", description: "Service health and this contract." },
    { name: "Public program", description: "Canonical published event, session, speaker, and agenda reads." },
  ],
  paths: {
    "/api/v1/health/live": {
      get: {
        tags: ["System"],
        operationId: "getLiveness",
        summary: "Check service liveness",
        responses: {
          "200": response("The Worker is running.", { $ref: "#/components/schemas/Health" }, { status: "ok", service: "programflow" }),
        },
      },
    },
    "/api/v1/openapi.json": {
      get: {
        tags: ["System"],
        operationId: "getOpenApiDocument",
        summary: "Inspect this OpenAPI contract",
        responses: { "200": response("OpenAPI 3.1 document.", { type: "object" }) },
      },
    },
    "/api/v1/public/events/{eventSlug}": {
      get: {
        tags: ["Public program"],
        operationId: "getPublishedEvent",
        summary: "Get a live published event",
        parameters: [eventSlug],
        responses: {
          "200": response("Canonical live event metadata and catalogs.", { $ref: "#/components/schemas/EventEnvelope" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/public/events/{eventSlug}/sessions": {
      get: {
        tags: ["Public program"],
        operationId: "listPublishedSessions",
        summary: "List live published sessions",
        parameters: [
          eventSlug, limit, cursor,
          parameter("search", "query", "Case-insensitive match across title, description, and speaker names.", { type: "string", maxLength: 120 }),
          catalogFilter("track"), catalogFilter("format"), catalogFilter("room"),
          parameter("day", "query", "Event-local date.", { type: "string", format: "date" }),
          parameter("speaker", "query", "Speaker ID or case-insensitive name fragment.", { type: "string" }),
        ],
        responses: {
          "200": response("A stable cursor page ordered by start time and session ID.", { $ref: "#/components/schemas/SessionCollectionEnvelope" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/public/events/{eventSlug}/sessions/{sessionId}": {
      get: {
        tags: ["Public program"],
        operationId: "getPublishedSession",
        summary: "Get one live published session",
        parameters: [eventSlug, parameter("sessionId", "path", "Canonical session UUID.", { type: "string", format: "uuid" }, true)],
        responses: {
          "200": response("The canonical live session.", { $ref: "#/components/schemas/SessionEnvelope" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/public/events/{eventSlug}/speakers": {
      get: {
        tags: ["Public program"],
        operationId: "listPublishedSpeakers",
        summary: "List speakers in the live program",
        parameters: [
          eventSlug, limit, cursor,
          parameter("search", "query", "Case-insensitive match across public speaker profile fields.", { type: "string", maxLength: 120 }),
          parameter("session", "query", "Session UUID or case-insensitive title fragment.", { type: "string" }),
        ],
        responses: {
          "200": response("A stable cursor page ordered by surname, name, and speaker ID.", { $ref: "#/components/schemas/SpeakerCollectionEnvelope" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/public/events/{eventSlug}/speakers/{speakerId}": {
      get: {
        tags: ["Public program"],
        operationId: "getPublishedSpeaker",
        summary: "Get one speaker in the live program",
        parameters: [eventSlug, parameter("speakerId", "path", "Canonical Person UUID.", { type: "string", format: "uuid" }, true)],
        responses: {
          "200": response("The canonical public speaker profile and live sessions.", { $ref: "#/components/schemas/SpeakerEnvelope" }),
          ...standardResponses,
        },
      },
    },
    "/api/v1/public/events/{eventSlug}/agenda": {
      get: {
        tags: ["Public program"],
        operationId: "listPublishedAgenda",
        summary: "List live agenda placements",
        parameters: [
          eventSlug, limit, cursor, catalogFilter("track"), catalogFilter("format"), catalogFilter("room"),
          parameter("day", "query", "Event-local date.", { type: "string", format: "date" }),
        ],
        responses: {
          "200": response("A stable cursor page of agenda entries ordered by start time and session ID.", { $ref: "#/components/schemas/AgendaEnvelope" }),
          ...standardResponses,
        },
      },
    },
  },
  components: {
    responses: {
      BadRequest: response("Invalid query or cursor.", { $ref: "#/components/schemas/ErrorEnvelope" }),
      NotFound: response("The event exists neither publicly nor at this identifier, or the requested live child resource is absent.", { $ref: "#/components/schemas/ErrorEnvelope" }),
      PublicationPaused: response("The event exists, but its Publication is not live. Draft and paused data are never returned.", { $ref: "#/components/schemas/ErrorEnvelope" }, { error: { code: "publication_not_live", message: "This event's public program is not live." } }),
      Unavailable: response("The canonical database is not configured.", { $ref: "#/components/schemas/ErrorEnvelope" }),
    },
    schemas: {
      Health: {
        type: "object", additionalProperties: false, required: ["status", "service"],
        properties: { status: { const: "ok" }, service: { const: "programflow" } },
      },
      ErrorEnvelope: {
        type: "object", additionalProperties: false, required: ["error"],
        properties: { error: { $ref: "#/components/schemas/Error" } },
      },
      Error: {
        type: "object", additionalProperties: false, required: ["code", "message"],
        properties: {
          code: { type: "string", example: "event_not_found" },
          message: { type: "string" },
          fields: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } },
        },
      },
      Pagination: {
        type: "object", additionalProperties: false, required: ["limit", "nextCursor", "hasMore"],
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
          nextCursor: { type: ["string", "null"] },
          hasMore: { type: "boolean" },
        },
      },
      CatalogItem: {
        type: "object", additionalProperties: false, required: ["id", "name"],
        properties: { id: { type: "string", format: "uuid" }, name: { type: "string" } },
      },
      SpeakerSummary: {
        type: "object", additionalProperties: false, required: ["id", "name", "company", "jobTitle"],
        properties: {
          id: { type: "string", format: "uuid" }, name: { type: "string" }, company: { type: "string" }, jobTitle: { type: "string" },
        },
      },
      SpeakerSession: {
        type: "object", additionalProperties: false, required: ["id", "title", "startsAt", "endsAt", "room"],
        properties: {
          id: { type: "string", format: "uuid" }, title: { type: "string" }, startsAt: { type: "string", format: "date-time" },
          endsAt: { type: "string", format: "date-time" }, room: { type: "string" },
        },
      },
      Speaker: {
        allOf: [
          { $ref: "#/components/schemas/SpeakerSummary" },
          {
            type: "object", required: ["eventSpeakerId", "biography", "headshotUrl", "sessions"],
            properties: {
              eventSpeakerId: { type: "string", format: "uuid" }, biography: { type: "string" },
              headshotUrl: { type: ["string", "null"] }, sessions: { type: "array", items: { $ref: "#/components/schemas/SpeakerSession" } },
            },
          },
        ],
      },
      Session: {
        type: "object", additionalProperties: false,
        required: ["id", "title", "description", "startsAt", "endsAt", "day", "room", "track", "format", "speakers"],
        properties: {
          id: { type: "string", format: "uuid" }, title: { type: "string" }, description: { type: "string" },
          startsAt: { type: "string", format: "date-time" }, endsAt: { type: "string", format: "date-time" }, day: { type: "string", format: "date" },
          room: { $ref: "#/components/schemas/CatalogItem" },
          track: { anyOf: [{ $ref: "#/components/schemas/CatalogItem" }, { type: "null" }] },
          format: { anyOf: [{ $ref: "#/components/schemas/CatalogItem" }, { type: "null" }] },
          speakers: { type: "array", items: { $ref: "#/components/schemas/Speaker" } },
        },
      },
      Event: {
        type: "object", additionalProperties: false,
        required: ["id", "slug", "name", "startsOn", "endsOn", "timezone", "location", "branding", "days", "tracks", "formats", "rooms", "publication"],
        properties: {
          id: { type: "string", format: "uuid" }, slug: { type: "string" }, name: { type: "string" },
          startsOn: { type: "string", format: "date" }, endsOn: { type: "string", format: "date" }, timezone: { type: "string" }, location: { type: "string" },
          branding: { type: "object", required: ["primaryColor"], properties: { primaryColor: { type: "string" }, logoUrl: { type: "string" } } },
          days: { type: "array", items: { type: "string", format: "date" } },
          tracks: { type: "array", items: { $ref: "#/components/schemas/CatalogItem" } }, formats: { type: "array", items: { $ref: "#/components/schemas/CatalogItem" } }, rooms: { type: "array", items: { $ref: "#/components/schemas/CatalogItem" } },
          publication: { type: "object", required: ["revision", "liveAt"], properties: { revision: { type: "integer" }, liveAt: { type: "string", format: "date-time" } } },
        },
      },
      AgendaEntry: {
        type: "object", additionalProperties: false, required: ["id", "startsAt", "endsAt", "day", "room", "track", "format", "session"],
        properties: {
          id: { type: "string", format: "uuid" }, startsAt: { type: "string", format: "date-time" }, endsAt: { type: "string", format: "date-time" }, day: { type: "string", format: "date" },
          room: { $ref: "#/components/schemas/CatalogItem" }, track: { anyOf: [{ $ref: "#/components/schemas/CatalogItem" }, { type: "null" }] }, format: { anyOf: [{ $ref: "#/components/schemas/CatalogItem" }, { type: "null" }] },
          session: { type: "object", required: ["id", "title", "speakers"], properties: { id: { type: "string", format: "uuid" }, title: { type: "string" }, speakers: { type: "array", items: { $ref: "#/components/schemas/SpeakerSummary" } } } },
        },
      },
      EventEnvelope: { type: "object", required: ["data", "links"], properties: { data: { $ref: "#/components/schemas/Event" }, links: { type: "object", additionalProperties: { type: "string" } } } },
      SessionCollectionEnvelope: { type: "object", required: ["data", "pagination"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/Session" } }, pagination: { $ref: "#/components/schemas/Pagination" } } },
      SessionEnvelope: { type: "object", required: ["data"], properties: { data: { $ref: "#/components/schemas/Session" } } },
      SpeakerCollectionEnvelope: { type: "object", required: ["data", "pagination"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/Speaker" } }, pagination: { $ref: "#/components/schemas/Pagination" } } },
      SpeakerEnvelope: { type: "object", required: ["data"], properties: { data: { $ref: "#/components/schemas/Speaker" } } },
      AgendaEnvelope: { type: "object", required: ["data", "pagination", "meta"], properties: { data: { type: "array", items: { $ref: "#/components/schemas/AgendaEntry" } }, pagination: { $ref: "#/components/schemas/Pagination" }, meta: { type: "object", required: ["eventId", "timezone", "days"], properties: { eventId: { type: "string", format: "uuid" }, timezone: { type: "string" }, days: { type: "array", items: { type: "string", format: "date" } } } } } },
    },
  },
} as const;
