import { describe, test, expect } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { extractGateGraph, findGateViolations, findUnclassifiedActions } from "./gateGraph";
import { selectCheckboxOption } from "../genericFields";

async function loadAbsStudyForm() {
  const bytes = new Uint8Array(await Bun.file("forms/abs-study/blank-form.pdf").arrayBuffer());
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return pdf.getForm();
}

describe("extractGateGraph", () => {
  test("finds the known lockUnlockNoYes rules in abs-study", async () => {
    const form = await loadAbsStudyForm();
    const rules = extractGateGraph(form);

    // 57 fields carry a Calculate action matching lockUnlockNoYes (55 found
    // via inline-string /JS, plus DummyCalcQ12/DummyCalcQ20 whose /JS is
    // stream-backed - see docs/20260814_action-audit.md), each contributing
    // one rule per possible answer; plus 2 Blur-pair fields
    // (Title1, Board.Title). 59 unique sourceFields, 92 total rules.
    expect(new Set(rules.map((r) => r.sourceField)).size).toBe(59);
    expect(rules.length).toBe(92);

    const citizenship = rules.find((r) => r.sourceField === "DummyCalcQ2");
    expect(citizenship).toBeDefined();
    expect(citizenship?.gateField).toBe("Q2");
    expect(citizenship?.triggerValue).toBe("Yes");
    expect(citizenship?.affectedFields).toContain("Q2Details.Country");
    expect(citizenship?.affectedFields).toContain("Q2Details.Date");

    const assets = rules.find((r) => r.sourceField === "DummyCalcQ44");
    expect(assets).toBeDefined();
    expect(assets?.gateField).toBe("Q44");
    expect(assets?.triggerValue).toBe("Yes");
    expect(assets?.affectedFields).toContain("44.Asset.0");
    expect(assets?.affectedFields).toContain("44.Make.0");

    const skip = rules.find((r) => r.sourceField === "DummyCalcQ43");
    expect(skip).toBeDefined();
    expect(skip?.gateField).toBe("Q43");
    expect(skip?.triggerValue).toBe("No");
    expect(skip?.affectedFields).toEqual(["Q43GoToQ55"]);
  });

  test("finds stream-backed Calculate actions (DummyCalcQ12, DummyCalcQ20)", async () => {
    const form = await loadAbsStudyForm();
    const rules = extractGateGraph(form);

    const maritalDate = rules.find((r) => r.sourceField === "DummyCalcQ12" && r.triggerValue === "Mar");
    expect(maritalDate).toBeDefined();
    expect(maritalDate?.gateField).toBe("Q12");
    expect(maritalDate?.affectedFields).toContain("Q12_Date.0");

    const otherOption = rules.find((r) => r.sourceField === "DummyCalcQ20" && r.triggerValue === "Other");
    expect(otherOption).toBeDefined();
    expect(otherOption?.gateField).toBe("Q20");
    expect(otherOption?.affectedFields).toContain("Q20Details.Other");
  });

  test("finds Blur-pair rules (Title1 -> TitleOther1, Board.Title -> Board.TitleOther)", async () => {
    const form = await loadAbsStudyForm();
    const rules = extractGateGraph(form);

    const title = rules.find((r) => r.gateField === "Title1");
    expect(title).toBeDefined();
    expect(title?.triggerValue).toBe("Off");
    expect(title?.affectedFields).toEqual(["TitleOther1"]);

    const boardTitle = rules.find((r) => r.gateField === "Board.Title");
    expect(boardTitle).toBeDefined();
    expect(boardTitle?.triggerValue).toBe("Off");
    expect(boardTitle?.affectedFields).toEqual(["Board.TitleOther"]);
  });

  test("also finds rules in income-and-assets - not hardcoded to one form", async () => {
    const bytes = new Uint8Array(await Bun.file("forms/income-and-assets/blank-form.pdf").arrayBuffer());
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdf.getForm();
    const rules = extractGateGraph(form);

    expect(rules.length).toBeGreaterThan(0);

    const rule = rules.find((r) => r.sourceField === "DummyCalcQ4" && r.triggerValue === "Yes");
    expect(rule).toBeDefined();
    expect(rule?.gateField).toBe("Q4");
    expect(rule?.affectedFields).toContain("Q6.FamilyName");
  });
});

describe("findUnclassifiedActions", () => {
  test("flags DummyCalcQ67_1's hand-written Calculate action, and nothing else spurious", async () => {
    const form = await loadAbsStudyForm();
    const unclassified = findUnclassifiedActions(form);

    expect(unclassified.some((a) => a.sourceField === "DummyCalcQ67_1" && a.actionKey === "C")).toBe(true);
    // Every known lockUnlockNoYes/Blur-pair source field must NOT also be
    // reported as unclassified - the two detectors should be exhaustive
    // partitions of "has this JS", not overlapping.
    const covered = new Set(extractGateGraph(form).map((r) => r.sourceField));
    for (const action of unclassified) {
      expect(covered.has(action.sourceField)).toBe(false);
    }
  });

  test("reports nothing for a form with no such conventions at all", async () => {
    const bytes = new Uint8Array(await Bun.file("forms/income-and-assets/blank-form.pdf").arrayBuffer());
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = pdf.getForm();

    expect(findUnclassifiedActions(form)).toEqual([]);
  });
});

describe("findGateViolations", () => {
  test("reports nothing against a pristine, unanswered form", async () => {
    const form = await loadAbsStudyForm();
    expect(findGateViolations(form)).toEqual([]);
  });

  test("flags a target field holding a value while its gate is locked", async () => {
    const form = await loadAbsStudyForm();
    selectCheckboxOption(form, "Q44", "No"); // trigger is "Yes" - "No" locks section 44
    form.getTextField("44.Asset.0").setText("a boat");

    const violations = findGateViolations(form);
    expect(violations.some((v) => v.includes("44.Asset.0"))).toBe(true);
  });

  test("reports nothing when a locked target is left blank", async () => {
    const form = await loadAbsStudyForm();
    selectCheckboxOption(form, "Q44", "No");

    const violations = findGateViolations(form);
    expect(violations.some((v) => v.includes("44.Asset.0"))).toBe(false);
  });

  test("flags the Blur-pair case directly: a title selected but the Other box still holds text", async () => {
    const form = await loadAbsStudyForm();
    selectCheckboxOption(form, "Title1", "Mr");
    form.getTextField("TitleOther1").setText("Some Placeholder");

    const violations = findGateViolations(form);
    expect(violations.some((v) => v.includes("TitleOther1"))).toBe(true);
  });

  test("reports nothing for the Blur-pair case when Other is correctly left blank", async () => {
    const form = await loadAbsStudyForm();
    selectCheckboxOption(form, "Title1", "Mr");

    const violations = findGateViolations(form);
    expect(violations.some((v) => v.includes("TitleOther1"))).toBe(false);
  });
});
