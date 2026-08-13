export function fileRequestActionLabel(status: "pending" | "complete") {
  return status === "complete" ? "Replace file" : "Upload file";
}

export type SpeakerPortalSection = "overview" | "sessions" | "tasks" | "profile" | "resources";

export function speakerPortalSection(pathname: string): SpeakerPortalSection {
  const section = pathname.split("/").filter(Boolean).at(-1);
  if (section === "sessions" || section === "tasks" || section === "profile" || section === "resources") return section;
  return "overview";
}

export function speakerPortalHeading(section: SpeakerPortalSection, firstName: string) {
  switch (section) {
    case "sessions": return { title: "Your sessions", description: "Review the program sessions currently released to your speaker workspace." };
    case "tasks": return { title: "Your tasks", description: "Complete assigned onboarding and delivery work for this event." };
    case "profile": return { title: "Your speaker profile", description: "Keep the biography and details used by organizers and public program pages current." };
    case "resources": return { title: "Speaker resources", description: "Open the guides and tools published for this event." };
    default: return { title: `Welcome, ${firstName}`, description: "See what needs attention, then move into a focused speaker workspace." };
  }
}
