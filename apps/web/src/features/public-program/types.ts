export type PublicSurface = "sessions" | "speakers" | "agenda" | "itinerary" | "gallery";
export type PublicWidgetType = "sessions" | "speakers" | "agenda" | "itinerary" | "speaker_gallery";
export type EmbedOutputFormat = "styled" | "basic" | "json" | "xml" | "ical";
export type WidgetField = "title" | "description" | "date_time" | "room" | "track" | "format" | "speakers" | "speaker_company" | "speaker_job_title";

export interface PublicSpeaker {
  id: string;
  eventSpeakerId: string;
  name: string;
  biography: string;
  company: string;
  jobTitle: string;
  headshotUrl: string | null;
  sessions: Array<{ id: string; title: string; startsAt: string; endsAt: string; room: string }>;
}

export interface PublicSession {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  day: string;
  room: { id: string; name: string };
  track: { id: string; name: string } | null;
  format: { id: string; name: string } | null;
  speakers: PublicSpeaker[];
}

export interface PublishedProgram {
  publication: { id: string; publicRevision: number; scheduleRevisionId: string; liveAt: string };
  event: {
    id: string;
    slug: string;
    name: string;
    startsOn: string;
    endsOn: string;
    timezone: string;
    location: string;
    branding: { primaryColor: string; logoUrl?: string };
  };
  days: string[];
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  sessions: PublicSession[];
  speakers: PublicSpeaker[];
}

export interface WidgetConfiguration {
  id: string;
  slug: string;
  name: string;
  widgetType: PublicWidgetType;
  branding: { primaryColor: string; backgroundColor: string; textColor: string; showEventBranding: boolean };
  filters: { trackIds: string[]; formatIds: string[]; roomIds: string[] };
  fields: WidgetField[];
  outputFormats: EmbedOutputFormat[];
  revision: number;
  updatedAt: string;
  publicUrl: string;
  styledIframeSnippet: string;
  styledScriptSnippet: string;
  outputUrls: Partial<Record<EmbedOutputFormat, string>>;
}

export interface PublishingWorkspace {
  event: PublishedProgram["event"];
  publication: null | {
    id: string;
    state: "draft" | "live" | "paused";
    scheduleRevisionId: string | null;
    publicRevision: number;
    liveAt: string | null;
    pausedAt: string | null;
  };
  revisions: Array<{ id: string; version: number; status: "draft" | "ready"; placementCount: number }>;
  eligibility: { totalSessions: number; approvedSessions: number; excludedSessions: number };
  catalogs: {
    tracks: Array<{ id: string; name: string }>;
    formats: Array<{ id: string; name: string }>;
    rooms: Array<{ id: string; name: string }>;
  };
  widgets: WidgetConfiguration[];
}
