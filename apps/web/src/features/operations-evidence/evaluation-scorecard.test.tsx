import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { EvaluationScorecardPage } from "./EvaluationScorecardPage";
import {
  evaluationAreas,
  evaluationScorecard,
  evidenceCenterRoute,
} from "./evaluation-scorecard-data";

type LedgerStatus =
  | "not_started"
  | "in_progress"
  | "implemented"
  | "verified"
  | "blocked_external";

type Ledger = {
  release_contract: {
    total_scenarios: number;
    total_rubric_items: number;
    required_rubric_items: number;
    required_item_points: number;
    crm_rubric_items: number;
    crm_item_points: number;
  };
  rubric_item_tracking: Record<string, {
    status: LedgerStatus;
    implementation_record: string;
    automated_evidence: string[];
  }>;
  rubric_areas: Array<{
    prefix: string;
    requirement_ids: string[];
  }>;
};

const ledgerPath = fileURLToPath(
  new URL("../../../../../docs/requirements/v1-ledger.json", import.meta.url),
);
describe("public evaluation scorecard truth", () => {
  it("renders the current contract, separates statuses, and links live proof", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter><EvaluationScorecardPage /></MemoryRouter>,
    );
    expect(markup).toContain("98 items. 202 points. Status without spin.");
    expect(markup).toContain("Implementation coverage is not a judge score");
    expect(markup).toContain("86 items");
    expect(markup).toContain("183 weighted points");
    expect(markup).toContain("12 items");
    expect(markup).toContain("19 weighted points");
    expect(markup).toContain("98/98");
    expect(markup).toContain("0/98");
    expect(markup).toContain("The public scorecard does not self-award passes.");
    expect(markup).toContain("Release verification begins at 0/98 here by design");
    expect(markup).toContain("current 20-scenario contract");
    expect(markup).toContain(`href="${evidenceCenterRoute}"`);
    expect(markup).toContain("Inspect live evidence");
    expect(markup).not.toContain("walkthrough");
    expect(markup).not.toContain("Evidence verified");
  });

  it("matches every public status count to the source-controlled ledger", () => {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as Ledger;
    const items = Object.entries(ledger.rubric_item_tracking);
    expect(evaluationScorecard.totalItems).toBe(
      ledger.release_contract.total_rubric_items,
    );
    expect(evaluationScorecard.requiredItems).toBe(
      ledger.release_contract.required_rubric_items,
    );
    expect(evaluationScorecard.requiredPoints).toBe(
      ledger.release_contract.required_item_points,
    );
    expect(evaluationScorecard.crmItems).toBe(
      ledger.release_contract.crm_rubric_items,
    );
    expect(evaluationScorecard.crmPoints).toBe(
      ledger.release_contract.crm_item_points,
    );
    expect(evaluationScorecard.scenarios).toBe(
      ledger.release_contract.total_scenarios,
    );
    expect(evaluationAreas.reduce((sum, area) => sum + area.points, 0)).toBe(
      evaluationScorecard.totalPoints,
    );
    expect(
      evaluationAreas
        .filter((area) => area.required)
        .reduce((sum, area) => sum + area.points, 0),
    ).toBe(evaluationScorecard.requiredPoints);
    expect(
      evaluationAreas
        .filter((area) => !area.required)
        .reduce((sum, area) => sum + area.points, 0),
    ).toBe(evaluationScorecard.crmPoints);
    expect(items.filter(([, item]) => item.status === "implemented")).toHaveLength(
      evaluationScorecard.implementedItems,
    );
    expect(items.filter(([, item]) => item.status === "verified")).toHaveLength(
      evaluationScorecard.verifiedItems,
    );
    expect(items.every(([, item]) => item.implementation_record.length > 0)).toBe(true);
    expect(items.every(([, item]) => item.automated_evidence.length > 0)).toBe(true);

    for (const area of evaluationAreas) {
      const ledgerArea = ledger.rubric_areas.find(
        (candidate) => candidate.prefix === area.prefix,
      );
      expect(ledgerArea?.requirement_ids).toHaveLength(area.items);
    }

  });

  it("does not expose the retired evaluator walkthrough", () => {
    expect(evaluationScorecard).not.toHaveProperty("walkthrough");
  });
});
