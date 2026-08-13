export function markdownToSafeHtml(markdown: string) {
  const escaped = escapeHtml(markdown);
  const blocks = escaped.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const heading = /^(#{1,3})\s+(.+)$/.exec(block);
    if (heading) { const level = heading[1]!.length; return `<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`; }
    const lines = block.split("\n");
    if (lines.every((line) => /^-\s+/.test(line))) return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^-\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${lines.map(inlineMarkdown).join("<br>")}</p>`;
  }).join("");
}

function inlineMarkdown(value: string) {
  return value
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function htmlToMarkdown(html: string) {
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, "### $1\n\n")
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gis, "*$1*")
    .replace(/<a[^>]*href=["'](https:[^"']+)["'][^>]*>(.*?)<\/a>/gis, "[$2]($1)")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
