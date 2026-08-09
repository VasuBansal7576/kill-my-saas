#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopePath = path.join(root, "Kill My SaaS Research Vault/09 Authoritative Clone Scope.md");
const specDir = path.join(root, "Kill My SaaS Research Vault/Attachments/Kill My SaaS Evals Repository/specs");
const ledgerPath = path.join(root, "docs/requirements/v1-ledger.json");
const ownershipPath = path.join(root, "docs/control-plane/ownership.json");
const personasPath = path.join(root, "docs/fixtures/evaluator-personas.json");

const read = (file) => fs.readFileSync(file, "utf8");
const readJson = (file) => JSON.parse(read(file));
const unique = (values) => [...new Set(values)];
const sorted = (values) => [...values].sort();
const idsIn = (text) => unique([...text.matchAll(/\b(?:CFP|ABS|SPK|CNT|AIA|EMB|CRM)-\d{2}\b/g)].map((match) => match[0]));

function section(text, start, end) {
  const startIndex = text.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section: ${start}`);
  const endIndex = text.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing section terminator: ${end}`);
  return text.slice(startIndex, endIndex);
}

function firstColumnTitles(markdown, headerTitle) {
  return markdown
    .split("\n")
    .map((line) => line.match(/^\| ([^|]+) \|/)?.[1]?.trim())
    .filter((title) => title && title !== headerTitle && !title.startsWith("---"));
}

function parseSpec(file) {
  const text = read(file);
  const rubricStart = text.indexOf("\nrubric:");
  assert.notEqual(rubricStart, -1, `Missing rubric section in ${file}`);
  const head = text.slice(0, rubricStart);
  const rubricText = text.slice(rubricStart);
  const optional = /^optional:\s*true\s*$/m.test(head);
  const prefix = head.match(/^prefix:\s*(\S+)\s*$/m)?.[1];
  assert.ok(prefix, `Missing prefix in ${file}`);
  const scenarioIds = unique([...head.matchAll(/^\s{2}- id:\s*([A-Z]+-S\d+)\s*$/gm)].map((match) => match[1]));
  const starts = [...rubricText.matchAll(/^\s{2}- id:\s*([A-Z]+-\d{2})\s*$/gm)];
  const rubrics = starts.map((match, index) => {
    const block = rubricText.slice(match.index, starts[index + 1]?.index ?? rubricText.length);
    const weight = Number(block.match(/^\s{4}weight:\s*(\d+)\s*$/m)?.[1]);
    const testability = block.match(/^\s{4}testability:\s*([^\n]+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
    assert.ok(Number.isInteger(weight), `Missing weight for ${match[1]}`);
    assert.ok(testability, `Missing testability for ${match[1]}`);
    return { id: match[1], weight, testability };
  });
  return { file, optional, prefix, scenarioIds, rubrics };
}

const scope = read(scopePath);
const ledger = readJson(ledgerPath);
const ownership = readJson(ownershipPath);
const personas = readJson(personasPath);
const specs = fs.readdirSync(specDir).filter((name) => name.endsWith(".yaml")).sort().map((name) => parseSpec(path.join(specDir, name)));

const requiredSpecs = specs.filter((spec) => !spec.optional);
const crmSpecs = specs.filter((spec) => spec.optional);
const requiredRubrics = requiredSpecs.flatMap((spec) => spec.rubrics);
const crmRubrics = crmSpecs.flatMap((spec) => spec.rubrics);
const requiredSpecIds = requiredRubrics.map((rubric) => rubric.id);
const crmSpecIds = crmRubrics.map((rubric) => rubric.id);
const requiredScenarioIds = requiredSpecs.flatMap((spec) => spec.scenarioIds);
const crmScenarioIds = crmSpecs.flatMap((spec) => spec.scenarioIds);

const requiredScopeIds = idsIn(section(scope, "## B. Required by the automated evaluation", "## C. Optional, extra-credit, or bonus requirements"));
const crmScopeIds = idsIn(section(scope, "### Speaker CRM — all 12 optional eval items", "### Brief/competition bonuses")).filter((id) => id.startsWith("CRM-"));
const humanTitles = firstColumnTitles(section(scope, "## A. Required by the brief or human judging", "### Competition delivery and judging contract"), "Human requirement");
const bonusTitles = firstColumnTitles(section(scope, "### Brief/competition bonuses", "## D. Explicitly unnecessary or de-scoped"), "Bonus");

const ledgerRequiredAreas = ledger.rubric_areas.filter((area) => area.required);
const ledgerCrmAreas = ledger.rubric_areas.filter((area) => !area.required && area.prefix === "CRM");
const ledgerRequiredIds = ledgerRequiredAreas.flatMap((area) => area.requirement_ids);
const ledgerCrmIds = ledgerCrmAreas.flatMap((area) => area.requirement_ids);
const ledgerRequiredScenarios = ledgerRequiredAreas.flatMap((area) => area.scenario_ids);
const ledgerCrmScenarios = ledgerCrmAreas.flatMap((area) => area.scenario_ids);

assert.deepEqual(sorted(requiredScopeIds), sorted(requiredSpecIds), "Required IDs differ between authoritative scope and eval specs");
assert.deepEqual(sorted(crmScopeIds), sorted(crmSpecIds), "CRM IDs differ between authoritative scope and eval specs");
assert.deepEqual(sorted(ledgerRequiredIds), sorted(requiredSpecIds), "Ledger required IDs differ from eval specs");
assert.deepEqual(sorted(ledgerCrmIds), sorted(crmSpecIds), "Ledger CRM IDs differ from eval specs");
assert.deepEqual(sorted(ledgerRequiredScenarios), sorted(requiredScenarioIds), "Ledger required scenarios differ from eval specs");
assert.deepEqual(sorted(ledgerCrmScenarios), sorted(crmScenarioIds), "Ledger CRM scenarios differ from eval specs");
assert.equal(unique(ledgerRequiredIds).length, ledgerRequiredIds.length, "Ledger contains duplicate required rubric IDs");
assert.equal(unique(ledgerCrmIds).length, ledgerCrmIds.length, "Ledger contains duplicate CRM rubric IDs");

assert.equal(requiredRubrics.length, ledger.release_contract.required_rubric_items);
assert.equal(requiredRubrics.reduce((sum, rubric) => sum + rubric.weight, 0), ledger.release_contract.required_item_points);
assert.equal(requiredScenarioIds.length, ledger.release_contract.required_scenarios);
assert.equal(crmRubrics.length, ledger.release_contract.crm_rubric_items);
assert.equal(crmRubrics.reduce((sum, rubric) => sum + rubric.weight, 0), ledger.release_contract.crm_item_points);
assert.equal(crmScenarioIds.length, ledger.release_contract.crm_scenarios);
assert.deepEqual(ledger.human_requirements.map((item) => item.title), humanTitles, "Ledger human requirements differ from scope table");
assert.equal(ledger.human_requirements.length, ledger.release_contract.human_requirements);
assert.deepEqual(ledger.named_bonuses.map((item) => item.title), bonusTitles, "Ledger bonus rows differ from scope table");
assert.equal(ledger.named_bonuses.length, ledger.release_contract.named_bonus_rows);

const partialIds = specs.flatMap((spec) => spec.rubrics).filter((rubric) => ["manual", "auto-partial"].includes(rubric.testability)).map((rubric) => rubric.id);
const manuallyCoveredIds = unique(ledger.manual_gates.flatMap((gate) => gate.rubric_ids));
assert.ok(partialIds.every((id) => manuallyCoveredIds.includes(id)), `Manual gates omit manual/auto-partial IDs: ${partialIds.filter((id) => !manuallyCoveredIds.includes(id)).join(", ")}`);
const requiredManualKinds = ["email_delivery", "calendar_files", "reviewer_isolation", "review_export", "ai_assessment", "speaker_isolation", "private_files", "external_embed", "canonical_consistency", "accelevents_sync", "airtable_sync", "reload_persistence", "public_access", "release_traceability", "human_walkthrough"];
assert.deepEqual(sorted(ledger.manual_gates.map((gate) => gate.evidence_kind)), sorted(requiredManualKinds), "Manual evidence kinds changed or are incomplete");

assert.equal(ownership.branch_policy.one_writer_per_worktree, true);
assert.equal(ownership.branch_policy.draft_pr_required, true);
assert.equal(ownership.modules.length, 13, "Ownership registry must contain all 13 architecture modules");
const handoffFields = ownership.structured_handoff.required_fields;
for (const field of ["requirement_ids", "roles", "persisted_state_before", "persisted_state_after", "downstream_handoffs", "automated_evidence", "manual_evidence", "known_blockers"]) {
  assert.ok(handoffFields.includes(field), `Structured handoff is missing ${field}`);
}

const personaByName = Object.fromEntries(personas.personas.map((persona) => [persona.persona, persona]));
const expectedPersonaEmails = {
  organizer: ["jordan.organizer@sbek-test.example.com", "sbek-organizer@example.com"],
  speaker: ["priya.speaker@sbek-test.example.com", "sbek-speaker@example.com"],
  speaker2: ["marcus.speaker@sbek-test.example.com", "sbek-speaker2@example.com"],
  reviewer: ["sam.reviewer@sbek-test.example.com", "sbek-reviewer@example.com"]
};
for (const [persona, expectedEmails] of Object.entries(expectedPersonaEmails)) {
  assert.ok(personaByName[persona], `Missing canonical persona ${persona}`);
  const actualEmails = [personaByName[persona].canonical_email, ...personaByName[persona].aliases].filter(Boolean);
  assert.deepEqual(sorted(actualEmails), sorted(expectedEmails), `Alias registry mismatch for ${persona}`);
}
const allPersonEmails = personas.personas.flatMap((persona) => [persona.canonical_email, ...persona.aliases].filter(Boolean));
assert.equal(unique(allPersonEmails.map((email) => email.toLowerCase())).length, allPersonEmails.length, "An email resolves to multiple persona entries");
assert.ok(personas.intentional_duplicate_candidates.some((candidate) => candidate.email === "priya.raman.alt@sbek-test.example.com" && candidate.must_not_be_preseeded_as_alias), "CRM duplicate candidate policy is missing");

const architecture = read(path.join(root, "architecture.md"));
assert.match(architecture.slice(0, 300), /^status:\s*approved$/m, "architecture.md is not approved");
assert.match(architecture, /\*\*Status: approved by the user on 2026-08-10\.\*\*/, "architecture approval decision is missing");
for (const requiredFile of ["AGENTS.md", "README.md", "prototype/kill-my-saas-ui-prototype.html", "Kill My SaaS Research Vault/09 Authoritative Clone Scope.md"]) {
  assert.ok(fs.existsSync(path.join(root, requiredFile)), `Missing baseline file: ${requiredFile}`);
}

console.log("ProgramFlow Wave 0 control plane: valid");
console.log(`Human requirements: ${humanTitles.length}`);
console.log(`Required scenarios/items/points: ${requiredScenarioIds.length}/${requiredRubrics.length}/${requiredRubrics.reduce((sum, rubric) => sum + rubric.weight, 0)}`);
console.log(`CRM scenarios/items/points: ${crmScenarioIds.length}/${crmRubrics.length}/${crmRubrics.reduce((sum, rubric) => sum + rubric.weight, 0)}`);
console.log(`Named bonus rows: ${bonusTitles.length}`);
console.log(`Manual/auto-partial rubric IDs covered: ${partialIds.length}`);
console.log(`Manual release gates: ${ledger.manual_gates.length}`);
console.log(`Ownership modules: ${ownership.modules.length}`);
console.log(`Canonical evaluator personas: ${personas.personas.length}`);
