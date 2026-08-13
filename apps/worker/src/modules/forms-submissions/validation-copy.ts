const developerValidationPatterns = [
  /^Invalid input:/i,
  /^Invalid (?:email|option|value)/i,
  /^Too (?:small|big):/i,
  /^Expected /i,
  /^Required$/i,
];

const submissionFieldCopy: Record<string, string> = {
  title: "Enter a proposal title between 3 and 180 characters.",
  answers: "Review the proposal answers and complete every required question.",
  participants: "Add each participant’s name, a valid email address, and a role.",
  saveAsDraft: "Choose whether to save this proposal as a draft.",
};

const formFieldCopy: Record<string, string> = {
  name: "Enter a form name between 3 and 160 characters.",
  opensAt: "Enter a valid opening date and time.",
  closesAt: "Enter a valid closing date and time.",
  minimumParticipants: "Enter a minimum participant count between 1 and 20.",
  maximumParticipants: "Enter a maximum participant count between 1 and 20.",
  participantRoleLabels: "Enter a label for every participant role.",
  fields: "Review the form questions, options, and conditional rules.",
  revision: "Refresh the form and try saving your changes again.",
};

export function friendlyValidationFields(
  code: string,
  fields: Record<string, string[] | undefined>,
): Record<string, string[]> {
  const fallbackByField = code === "invalid_submission" ? submissionFieldCopy : formFieldCopy;
  return Object.fromEntries(Object.entries(fields).map(([field, messages]) => {
    const fallback = fallbackByField[field] ?? "Review this value and try again.";
    const friendly = (messages ?? []).map((message) => isDeveloperValidationMessage(message) ? fallback : message);
    return [field, friendly.length > 0 ? friendly : [fallback]];
  }));
}

function isDeveloperValidationMessage(message: string): boolean {
  return developerValidationPatterns.some((pattern) => pattern.test(message));
}
