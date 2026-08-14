export type OrganizationRole = "organizer";
export type EventRole = "organizer" | "speaker" | "reviewer";

export interface Actor {
  identityId: string;
  personId: string;
  organizationRoles: ReadonlyArray<{ organizationId: string; role: OrganizationRole }>;
  eventRoles: ReadonlyArray<{ eventId: string; role: EventRole }>;
}

export type ActorContext = { Variables: { actor: Actor } };

export function actorCanAccessEvent(actor: Actor, eventId: string, role: EventRole): boolean {
  return actor.eventRoles.some((grant) => grant.eventId === eventId && grant.role === role);
}
