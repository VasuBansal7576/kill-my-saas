export const brandColorChoices = [
  { value: "#7c5cff", label: "Violet" },
  { value: "#6c94f9", label: "Blue" },
  { value: "#4bb982", label: "Green" },
  { value: "#d6a24c", label: "Gold" },
  { value: "#e3616c", label: "Coral" },
] as const;

export function friendlyTimezoneLabel(value: string): string {
  if (value === "UTC") return "UTC · Coordinated Universal Time";
  const [region = "", ...placeParts] = value.split("/");
  if (!placeParts.length) return value.replaceAll("_", " ");
  return `${placeParts.join(" / ").replaceAll("_", " ")} · ${region.replaceAll("_", " ")}`;
}

export function canonicalTimezone(value: string): string {
  return value === "Asia/Calcutta" ? "Asia/Kolkata" : value;
}
