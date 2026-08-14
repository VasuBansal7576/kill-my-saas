import { describe, expect, it } from "vitest";
import { createZip, safePath } from "./zip";

describe("latest-version ZIP artifact", () => {
  it("writes a parseable central directory and retained manifest", () => {
    const archive = createZip([
      { path: "Taming CI/Priya/slides.pdf", contents: new TextEncoder().encode("version-two") },
      { path: "manifest.json", contents: new TextEncoder().encode('{"version":2}') },
    ]);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.byteLength - 22, true)).toBe(0x06054b50);
    expect(view.getUint16(archive.byteLength - 12, true)).toBe(2);
    expect(new TextDecoder().decode(archive)).toContain("manifest.json");
    expect(new TextDecoder().decode(archive)).toContain("version-two");
  });

  it("prevents archive traversal and unsafe filenames", () => {
    expect(safePath("../../Marcus/../slides?.pdf")).toBe("Marcus/slides_.pdf");
  });
});
