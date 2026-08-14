import { decisions, deliverables, sessions, speakerTasks } from "@programflow/database";
import { and, isNotNull, isNull, or, sql } from "drizzle-orm";

/**
 * Sessions created outside the proposal workflow are immediately speaker-visible.
 * Proposal-derived sessions become visible everywhere from the single persisted
 * decision release timestamp.
 */
export function releasedSpeakerSession() {
  return or(isNull(sessions.sourceSubmissionId), isNotNull(decisions.releasedAt));
}

/**
 * A direct profile file or a non-session file request is speaker-visible without
 * a program decision. A session-file request must be linked to a session, and
 * that session must pass the release boundary. This also keeps an incomplete
 * handoff from exposing a session-derived task title before it is linked.
 */
export function releasedSpeakerDeliverable() {
  return or(
    isNull(deliverables.taskAssignmentId),
    sql`${speakerTasks.configuration}->>'handoff' <> 'session_file'`,
    and(isNotNull(deliverables.sessionId), releasedSpeakerSession()),
  );
}
