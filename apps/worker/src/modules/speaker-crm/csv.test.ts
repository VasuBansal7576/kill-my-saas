import { describe, expect, it } from "vitest";
import { CrmCsvError, parseCrmCsv } from "./csv";

describe("Speaker CRM safe CSV import", () => {
  it("parses quoted fields, tags, and organizer-defined metadata", () => {
    const rows = parseCrmCsv('Name,Email,Company,Job title,Tags,custom.Topic\n"Patel, Mina",MINA@example.com,Northstar,VP Engineering,"AI|Infra",Agents\n');
    expect(rows).toEqual([{ row: 2, input: {
      displayName: "Patel, Mina",
      email: "mina@example.com",
      company: "Northstar",
      jobTitle: "VP Engineering",
      biography: "",
      internalNotes: "",
      tags: ["AI", "Infra"],
      customMetadata: { Topic: "Agents" },
    } }]);
  });

  it("rejects duplicate emails before any database transaction begins", () => {
    expect(() => parseCrmCsv("name,email\nMina Patel,mina@example.com\nMina P.,MINA@example.com\n"))
      .toThrowError(CrmCsvError);
  });

  it("rejects malformed and oversized input with a row-specific error", () => {
    expect(() => parseCrmCsv('name,email\n"Mina,mina@example.com\n')).toThrow(/CSV row 2/);
    const rows = ["name,email", ...Array.from({ length: 5_001 }, (_, index) => `Person ${index},p${index}@example.com`)];
    expect(() => parseCrmCsv(rows.join("\n"))).toThrow(/5,000/);
  });
});
