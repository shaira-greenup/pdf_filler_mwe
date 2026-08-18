import { createSignal } from "solid-js";
import { FORM_REGISTRY } from "./lib/registry";
import { fillFormInBrowser } from "./lib/fillInBrowser";
import { downloadPdf } from "./lib/download";

// TEMPORARY spot-check, not the real UI (that's IncomeAndAssetsForm.tsx /
// AbsStudyForm.tsx / the rebuilt App.tsx in later steps). Everything up to
// here (registry/loadFormBrowser/browserHash/fillInBrowser) was only ever
// exercised under Bun as a stand-in; this button is the first time
// download.ts's real DOM APIs and pdf-lib's save() run in an actual browser
// JS engine. Remove this block once confirmed working.
const TEST_BUSINESS_INPUT = {
  familyName: "Hello",
  firstName: "Alex",
  secondName: "Morgan",
  clientReferenceNumber: "1234567890",
  question4: false,
  employment: { personWorking: "You", workType: "Casual", usualWage: true },
};

// Placeholder for now - the form picker, fill flow, and gate-warning panel
// land in a later step. This just proves the Vite + Solid + Tailwind shell
// renders end to end - the extra styling here is only to make Tailwind's
// output visually unmistakable (card, shadow, color, hover state), not a
// preview of the real UI.
export default function App() {
  const [status, setStatus] = createSignal("");

  async function runTestFill() {
    setStatus("filling...");
    try {
      const entry = FORM_REGISTRY["income-and-assets"];
      if (!entry) throw new Error("income-and-assets not found in registry");
      const { bytes, violations } = await fillFormInBrowser(entry, TEST_BUSINESS_INPUT);
      downloadPdf(bytes, "test-filled.pdf");
      setStatus(`OK - downloaded ${bytes.length} bytes, ${violations.length} gate warning(s) (see console)`);
      console.log("gate violations:", violations);
    } catch (err) {
      setStatus(`ERROR: ${(err as Error).message}`);
      console.error(err);
    }
  }

  return (
    <main class="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-6">
      <div class="max-w-sm w-full rounded-xl border border-slate-200 bg-white p-8 shadow-lg space-y-4">
        <h1 class="text-2xl font-semibold text-slate-800">PDF Form Filler</h1>
        <p class="text-sm text-slate-500">
          Tailwind is wired up - this card's border, shadow, gradient
          background, and the button below all come from utility classes.
        </p>
        <button
          type="button"
          class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          Looks right
        </button>

        <hr class="border-slate-200" />

        <button
          type="button"
          onClick={runTestFill}
          class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          Fill test PDF (temporary)
        </button>
        {status() && <p class="text-xs text-slate-500 break-words">{status()}</p>}
      </div>
    </main>
  );
}
