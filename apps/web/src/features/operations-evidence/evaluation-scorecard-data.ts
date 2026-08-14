export const evidenceCenterRoute =
  "/organizer/events/devflow-conf-2027/evaluation-evidence";

export const evaluationScorecard = {
  effectiveDate: "13 August 2026",
  totalItems: 98,
  totalPoints: 202,
  requiredItems: 86,
  requiredPoints: 183,
  crmItems: 12,
  crmPoints: 19,
  scenarios: 20,
  implementedItems: 98,
  implementedPoints: 202,
  verifiedItems: 0,
  verifiedPoints: 0,
  walkthrough: {
    href: "/artifacts/programflow-judge-walkthrough.mp4",
    durationSeconds: 76.1,
    durationLabel: "1:16",
    sizeBytes: 26_594_685,
    sizeLabel: "25.4 MiB",
    sha256:
      "7350809c913cf280127affc6b59424b16dc8430a4e9fbece443729a07dbe3c8f",
  },
} as const;

export const evaluationAreas = [
  { prefix: "CFP", name: "Call for Papers", items: 18, points: 38, required: true },
  { prefix: "ABS", name: "Abstract Management", items: 14, points: 28, required: true },
  { prefix: "SPK", name: "Speaker Management", items: 16, points: 33, required: true },
  { prefix: "CNT", name: "Content Management", items: 14, points: 31, required: true },
  { prefix: "AIA", name: "Agenda & Schedule", items: 8, points: 18, required: true },
  { prefix: "EMB", name: "Public & Embeddable", items: 16, points: 35, required: true },
  { prefix: "CRM", name: "Speaker CRM", items: 12, points: 19, required: false },
] as const;
