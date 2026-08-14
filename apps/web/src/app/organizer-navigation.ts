export function organizerNavigation(eventSlug: string, organizationId: string) {
  const base = `/organizer/events/${encodeURIComponent(eventSlug)}`;
  return [
    ["Dashboard", `${base}/dashboard`],
    ["Event settings", `${base}/settings`],
    ["Call for speakers", `${base}/cfp`],
    ["Submissions", `${base}/submissions`],
    ["Evaluations", `${base}/evaluations`],
    ["Speakers", `${base}/speakers`],
    ["Tasks", `${base}/tasks`],
    ["Portal resources", `${base}/resources`],
    ["Files", `${base}/files`],
    ["Communications", `${base}/communications`],
    ["Agenda", `${base}/agenda`],
    ["Public program", `${base}/publish`],
    ["Speaker CRM", `/organizer/organizations/${organizationId}/speaker-crm`],
    ["Integrations", `${base}/integrations/airtable`],
    ["Accelevents", `${base}/integrations/accelevents`],
    ["API", `${base}/api`],
    ["Evaluation evidence", `${base}/evaluation-evidence`],
    ["Help", "/help"],
  ] as const;
}
