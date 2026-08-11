import { describe, expect, it } from "vitest";
import { magicBytesMatch } from "./storage";

describe("private file verification", () => {
  it("accepts only bytes matching the declared allowlisted media type", () => {
    expect(magicBytesMatch(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), "application/pdf")).toBe(true);
    expect(magicBytesMatch(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
    expect(magicBytesMatch(new Uint8Array([0x25, 0x50, 0x44, 0x46]), "image/png")).toBe(false);
    expect(magicBytesMatch(new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]), "text/html")).toBe(false);
  });
});
