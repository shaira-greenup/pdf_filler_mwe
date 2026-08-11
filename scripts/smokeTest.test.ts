import { describe, test, expect } from "bun:test";
import { listFormIds, resolveFormPaths } from "./lib/formPaths";
import { loadForm } from "./lib/loadForm";
import { assertTemplateHash } from "./lib/hash";
import { runSmokeTest } from "./lib/smokeTest";

// Runs the mechanical-completeness smoke test against every form registered
// under forms/ - no hand-authored business schema required. A brand-new
// form gets this coverage automatically the moment it's init'd, with zero
// test-authoring. See CLAUDE.md's Workflow section on the difference
// between this and business-semantic testing (which belongs in that form's
// own fill.test.ts).
describe("smoke test - every registered form", () => {
  for (const id of listFormIds()) {
    test(`${id}: every fillable field round-trips and unhides correctly`, async () => {
      const paths = resolveFormPaths(id);
      const { bytes } = await loadForm(paths.pdfPath);
      await assertTemplateHash(bytes, paths.fieldsTxtPath);

      const result = await runSmokeTest(bytes);
      expect(result.mismatches).toEqual([]);
      expect(result.stillHidden).toEqual([]);
      expect(result.fillableCount).toBeGreaterThan(0);
    });
  }
});
