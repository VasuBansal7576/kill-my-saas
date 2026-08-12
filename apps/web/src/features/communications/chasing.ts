const compose = {
  kind: "reminder" as const,
  name: "Employer approval check-in",
  subjectTemplate: "Checking your participation in {{ event_name }}",
  htmlTemplate: "<p>Hello {{first_name}},</p><p>We know employer approval can take time. Could you share where that process stands and whether the program team can help?</p>",
  textTemplate: "Hello {{first_name}}, we know employer approval can take time. Could you share where that process stands and whether the program team can help?",
};

export function employerApprovalChaseDraft() {
  return {
    filters: { search: "", status: "", taskStatus: "all", employerApprovalStatus: "pending" },
    compose,
    selectedPersonIds: [] as string[],
  };
}

export function employerApprovalHistory(
  personId: string,
  campaigns: Array<{ type: unknown; createdAt: string; recipientPersonIds: string[] }>,
) {
  const contacts = campaigns.filter((campaign) =>
    campaign.type === "employer_approval_chase" && campaign.recipientPersonIds.includes(personId));
  return { count: contacts.length, lastAt: contacts.map((campaign) => campaign.createdAt).sort().at(-1) ?? null };
}
