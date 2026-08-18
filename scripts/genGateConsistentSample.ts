import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveFormPaths } from "./lib/formPaths";
import { loadForm } from "./lib/loadForm";
import { synthesizeValidData, isFillable } from "./genericFields";
import { extractGateGraph, type GateRule } from "./lib/gateGraph";

// Diagnostic generator, not part of the CLI's five subcommands: builds a
// sample-data.json variant where every gate is answered exactly once and
// consistently - the chosen branch's fields get real synthesized values,
// every other branch's fields are left out of the file entirely (so they
// stay at the PDF's own pristine, blank default rather than being set to ""
// and tripping a date/format regex). This is the fixture to check
// findGateViolations against for false positives (a maximally-filled yet
// fully consistent form) and, by deliberately re-introducing one removed
// field, false negatives.
interface SchemaModule {
  FormDataSchema: { shape: Record<string, unknown> };
}
interface MappingModule {
  MAPPED_FIELD_NAMES: readonly string[];
}

const [, , id] = process.argv;
if (!id) throw new Error("Usage: bun run scripts/genGateConsistentSample.ts <id>");

const paths = resolveFormPaths(id);
const { form } = await loadForm(paths.pdfPath);

const mappingModule = (await import(pathToFileURL(resolve(paths.mappingPath)).href)) as MappingModule;
const schemaModule = (await import(pathToFileURL(resolve(paths.schemaPath)).href)) as SchemaModule;
const mapped = new Set(mappingModule.MAPPED_FIELD_NAMES);
const knownKeys = new Set(Object.keys(schemaModule.FormDataSchema.shape));

const rules = extractGateGraph(form);
const byGate = new Map<string, GateRule[]>();
for (const rule of rules) {
  if (mapped.has(rule.gateField)) continue; // governed by the business schema instead
  const list = byGate.get(rule.gateField) ?? [];
  list.push(rule);
  byGate.set(rule.gateField, list);
}

function countRealTargets(rule: GateRule): number {
  return rule.affectedFields.filter((name) => {
    if (mapped.has(name)) return false;
    const field = form.getFieldMaybe(name);
    return field !== undefined && isFillable(field);
  }).length;
}

// One trigger per gate, preferring whichever branch actually reveals
// fillable content - exercises more of the form than always picking the
// first rule found.
const chosenByGate = new Map<string, GateRule>();
for (const [gate, gateRules] of byGate) {
  const chosen = gateRules.reduce((a, b) => (countRealTargets(b) > countRealTargets(a) ? b : a));
  chosenByGate.set(gate, chosen);
}

const unlockedFields = new Set<string>();
for (const chosen of chosenByGate.values()) {
  for (const name of chosen.affectedFields) unlockedFields.add(name);
}

const lockedFields = new Set<string>();
for (const gateRules of byGate.values()) {
  for (const rule of gateRules) {
    if (chosenByGate.get(rule.gateField) !== rule) {
      for (const name of rule.affectedFields) lockedFields.add(name);
    }
  }
}
for (const name of unlockedFields) lockedFields.delete(name);

const data = synthesizeValidData(form);
for (const name of mapped) delete data[name];
for (const name of lockedFields) delete data[name];
for (const [gate, chosen] of chosenByGate) data[gate] = chosen.triggerValue;

// Reuse the existing, already-verified business-schema data (e.g.
// citizenship) rather than trying to auto-synthesize an arbitrary Zod shape.
const existing = (await Bun.file(paths.sampleDataPath).json()) as Record<string, unknown>;
const businessData: Record<string, unknown> = {};
for (const [key, value] of Object.entries(existing)) {
  if (knownKeys.has(key)) businessData[key] = value;
}

const outPath = `${paths.dir}/sample-data.gate-consistent.json`;
await Bun.write(outPath, JSON.stringify({ ...businessData, ...data }, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`Gates answered: ${chosenByGate.size}, fields left blank (locked): ${lockedFields.size}`);
