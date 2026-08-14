import type { Actor } from "../identity-access/actor";
import { actorCanAccessEvent } from "../identity-access/actor";

export function canAccessPrivateSpeakerFile(actor: Actor, eventId: string, ownerPersonId: string): boolean {
  return actorCanAccessEvent(actor, eventId, "organizer")
    || (actor.personId === ownerPersonId && actorCanAccessEvent(actor, eventId, "speaker"));
}
