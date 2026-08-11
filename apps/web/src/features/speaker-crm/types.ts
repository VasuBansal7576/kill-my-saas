export interface CrmFilters {
  search: string;
  companies: string[];
  jobTitles: string[];
  tags: string[];
  metadata: Record<string, string>;
}

export interface CrmContact {
  contactId: string;
  personId: string;
  displayName: string;
  email: string | null;
  biography: string;
  company: string;
  jobTitle: string;
  headshotFileId: string | null;
  tags: string[];
  customMetadata: Record<string, string>;
  internalNotes: string;
  revision: number;
  eventCount: number;
  pipeline: null | { enrollmentId: string; pipelineId: string; stageId: string; stageName: string; outcome: "open" | "won" | "lost" };
  updatedAt: string;
}

export interface CrmContactDetail extends CrmContact {
  aliases: string[];
  notes: Array<{ id: string; body: string; authorPersonId: string; authorName: string; createdAt: string }>;
  eventHistory: Array<{ eventId: string; eventSlug: string; eventName: string; eventSpeakerId: string; status: string; sessions: Array<{ id: string; title: string; role: string }> }>;
  stageHistory: Array<{ id: string; fromStage: string | null; toStage: string; note: string; movedBy: string; createdAt: string }>;
  mergedSources: Array<{ contactId: string; personId: string; mergedAt: string }>;
}

export interface CrmDuplicateGroup { key: string; reason: string; contacts: CrmContact[] }
export interface CrmSegment { id: string; name: string; filterDefinition: Partial<CrmFilters>; memberCount: number; createdAt: string; updatedAt: string }
export interface CrmPipeline {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; position: number; outcome: "open" | "won" | "lost"; contacts: CrmContact[] }>;
}
export interface CrmEvent { id: string; slug: string; name: string; startsOn: string }
export interface CrmMetrics {
  totalContacts: number;
  contactsWithEventHistory: number;
  representedEvents: number;
  pipelineOpen: number;
  pipelineWon: number;
  pendingOutreachHandoffs: number;
  contactsByCompany: Array<{ label: string; count: number }>;
  popularTags: Array<{ label: string; count: number }>;
}
export interface CrmOutreachHandoff {
  requestId: string;
  organizationId: string;
  recipientPersonIds: string[];
  recipientSnapshot: Array<{ contactId: string; personId: string; displayName: string; email: string }>;
  idempotencyKey: string;
  idempotent: boolean;
}
