const allowedTags = new Set([
  "a", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "hr", "iframe",
  "li", "ol", "p", "pre", "span", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
]);
const voidTags = new Set(["br", "hr"]);
const globalAttributes = new Set(["class", "title"]);
const tagAttributes: Record<string, Set<string>> = {
  a: new Set(["href", "target"]),
  iframe: new Set(["src", "height", "width"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

export function sanitizeSpeakerResourceHtml(html: string, allowedEmbedOrigins: readonly string[]): string {
  const origins = new Set(allowedEmbedOrigins.map((origin) => normalizeOrigin(origin)).filter((origin): origin is string => Boolean(origin)));
  const tokens = html.match(/<[^>]*>|[^<]+/g) ?? [];
  const output: string[] = [];
  const suppressed: string[] = [];
  const openTags: string[] = [];

  for (const token of tokens) {
    const tag = token.match(/^<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>$/s);
    if (!tag) {
      if (suppressed.length === 0) output.push(escapeHtml(token));
      continue;
    }
    const closing = tag[1] === "/";
    const name = (tag[2] ?? "").toLowerCase();
    if (name === "script" || name === "style") {
      if (closing) suppressed.pop();
      else suppressed.push(name);
      continue;
    }
    if (suppressed.length > 0 || !allowedTags.has(name)) continue;
    if (closing) {
      const openIndex = openTags.lastIndexOf(name);
      if (!voidTags.has(name) && openIndex >= 0) {
        for (let index = openTags.length - 1; index >= openIndex; index -= 1) {
          output.push(`</${openTags[index]}>`);
        }
        openTags.splice(openIndex);
      }
      continue;
    }

    const attributes = sanitizeAttributes(name, tag[3] ?? "", origins);
    if (name === "iframe" && !attributes.some(([key]) => key === "src")) continue;
    if (name === "iframe") {
      attributes.push(["sandbox", "allow-forms allow-popups allow-same-origin"], ["referrerpolicy", "no-referrer"]);
    }
    if (name === "a") {
      attributes.push(["rel", "noopener noreferrer"]);
      if (!attributes.some(([key]) => key === "target")) attributes.push(["target", "_blank"]);
    }
    output.push(`<${name}${attributes.map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join("")}>`);
    if (!voidTags.has(name)) openTags.push(name);
  }
  for (let index = openTags.length - 1; index >= 0; index -= 1) output.push(`</${openTags[index]}>`);
  return output.join("");
}

function sanitizeAttributes(name: string, source: string, allowedOrigins: ReadonlySet<string>): Array<[string, string]> {
  const allowed = new Set([...globalAttributes, ...(tagAttributes[name] ?? [])]);
  const attributes: Array<[string, string]> = [];
  const expression = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of source.matchAll(expression)) {
    const key = (match[1] ?? "").toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!allowed.has(key) || key.startsWith("on")) continue;
    if (key === "href" && !safeLink(value)) continue;
    if (key === "src" && name === "iframe" && !safeEmbed(value, allowedOrigins)) continue;
    if (key === "target" && value !== "_blank" && value !== "_self") continue;
    attributes.push([key, value]);
  }
  return attributes;
}

function safeLink(value: string): boolean {
  if (value.startsWith("/") || value.startsWith("#")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function safeEmbed(value: string, allowedOrigins: ReadonlySet<string>): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
