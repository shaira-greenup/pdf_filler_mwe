import { describe, test, expect } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { extractGateGraph, findGateViolations } from "./gateGraph";
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

    // 55 fields carry a Calculate action, but several (e.g. Q30, Q43) encode
    // two rules each (one per possible answer) - 72 total rules is the
    // right invariant, not the field count.
    expect(new Set(rules.map((r) => r.sourceField)).size).toBe(55);
    expect(rules.length).toBe(72);

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
});
