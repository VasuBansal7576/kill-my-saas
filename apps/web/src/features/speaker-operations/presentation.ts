export function fileRequestActionLabel(status: "pending" | "complete") {
  return status === "complete" ? "Replace file" : "Upload file";
}
