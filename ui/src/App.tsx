import { createResource, createSignal, For, Show } from "solid-js";
import { FORM_REGISTRY, listFormEntries } from "./lib/registry";
import { fillFormInBrowser } from "./lib/fillInBrowser";
import { downloadPdf } from "./lib/download";
import { listClients, type ClientRecord } from "./lib/clientDb";
import { deriveIncomeAndAssetsInput } from "./lib/deriveIncomeAndAssets";
import { deriveAbsStudyInput } from "./lib/deriveAbsStudy";
import IncomeAndAssetsForm, {
  DEFAULT_INCOME_AND_ASSETS_VALUE,
  toIncomeAndAssetsBusinessInput,
  type IncomeAndAssetsFormValue,
} from "./forms/IncomeAndAssetsForm";
import AbsStudyForm, {
  DEFAULT_ABS_STUDY_VALUE,
  toAbsStudyBusinessInput,
  type AbsStudyFormValue,
} from "./forms/AbsStudyForm";

type FormId = "income-and-assets" | "abs-study";

type FillState =
  | { status: "idle" }
  | { status: "filling" }
  | { status: "done"; violations: string[] }
  | { status: "error"; message: string };

const selectClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

export default function App() {
  const [formId, setFormId] = createSignal<FormId>("income-and-assets");
  const [clients] = createResource(listClients);
  const [selectedClientId, setSelectedClientId] = createSignal<number | "">("");

  const [incomeValue, setIncomeValue] = createSignal(DEFAULT_INCOME_AND_ASSETS_VALUE);
  const [incomeUncertain, setIncomeUncertain] = createSignal<ReadonlySet<keyof IncomeAndAssetsFormValue>>(new Set());
  const [absValue, setAbsValue] = createSignal(DEFAULT_ABS_STUDY_VALUE);
  const [absUncertain, setAbsUncertain] = createSignal<ReadonlySet<keyof AbsStudyFormValue>>(new Set());

  const [fillState, setFillState] = createSignal<FillState>({ status: "idle" });

  function selectForm(id: FormId) {
    setFormId(id);
    setFillState({ status: "idle" });
  }

  // "AI collation" step (deliberately simulated/deterministic for this MWE
  // - see docs/20260818_browser-ui-mwe-plan.md): derives both forms' inputs
  // from whichever client record was picked, and records which fields
  // neither derive function could confidently answer, so each form's own
  // review-summary banner can flag exactly those.
  function applyClient(client: ClientRecord | undefined) {
    if (!client) {
      setIncomeValue(DEFAULT_INCOME_AND_ASSETS_VALUE);
      setIncomeUncertain(new Set<keyof IncomeAndAssetsFormValue>());
      setAbsValue(DEFAULT_ABS_STUDY_VALUE);
      setAbsUncertain(new Set<keyof AbsStudyFormValue>());
      return;
    }
    const income = deriveIncomeAndAssetsInput(client);
    setIncomeValue(income.value);
    setIncomeUncertain(new Set(income.uncertainFields));

    const abs = deriveAbsStudyInput(client);
    setAbsValue(abs.value);
    setAbsUncertain(new Set(abs.uncertainFields));
  }

  function handleSelectClient(e: Event & { currentTarget: HTMLSelectElement }) {
    setFillState({ status: "idle" });
    const raw = e.currentTarget.value;
    if (!raw) {
      setSelectedClientId("");
      applyClient(undefined);
      return;
    }
    const id = Number(raw);
    setSelectedClientId(id);
    applyClient(clients()?.find((c) => c.id === id));
  }

  // Mirrors scripts/lib/fillForm.ts's own sequence end to end (see
  // fillInBrowser.ts) - this handler is only responsible for gathering this
  // form's business input and handing the caller its result, same as the
  // CLI's fill <id> subcommand.
  async function handleFill() {
    setFillState({ status: "filling" });
    try {
      const id = formId();
      const entry = FORM_REGISTRY[id];
      if (!entry) throw new Error(`${id} not found in registry`);
      const businessInput =
        id === "income-and-assets" ? toIncomeAndAssetsBusinessInput(incomeValue()) : toAbsStudyBusinessInput(absValue());
      const { bytes, violations } = await fillFormInBrowser(entry, businessInput);
      downloadPdf(bytes, `${id}-filled.pdf`);
      setFillState({ status: "done", violations });
    } catch (err) {
      setFillState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <main class="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-6">
      <div class="mx-auto max-w-xl space-y-6">
        <header>
          <h1 class="text-2xl font-semibold text-slate-800">PDF Form Filler</h1>
          <p class="text-sm text-slate-500">Runs entirely in your browser - nothing here is sent anywhere.</p>
        </header>

        <div class="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
          <label class="block">
            <span class="text-sm font-medium text-slate-700">Client (dummy CRM record)</span>
            <select value={selectedClientId()} onChange={handleSelectClient} class={selectClass}>
              <option value="">Start blank (no client selected)</option>
              <For each={clients() ?? []}>
                {(client) => (
                  <option value={client.id}>
                    {client.FirstName} {client.LastName}
                  </option>
                )}
              </For>
            </select>
            <Show when={clients.loading}>
              <p class="mt-1 text-xs text-slate-400">Loading client records...</p>
            </Show>
            <Show when={clients.error}>
              <p class="mt-1 text-xs text-red-600">Failed to load client records: {(clients.error as Error).message}</p>
            </Show>
          </label>

          <div class="flex gap-2">
            <For each={listFormEntries()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => selectForm(entry.id as FormId)}
                  class={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    formId() === entry.id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {entry.label}
                </button>
              )}
            </For>
          </div>

          <Show when={formId() === "income-and-assets"}>
            <IncomeAndAssetsForm value={incomeValue()} onChange={setIncomeValue} uncertainFields={incomeUncertain()} />
          </Show>
          <Show when={formId() === "abs-study"}>
            <AbsStudyForm value={absValue()} onChange={setAbsValue} uncertainFields={absUncertain()} />
          </Show>

          <button
            type="button"
            onClick={handleFill}
            disabled={fillState().status === "filling"}
            class="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {fillState().status === "filling" ? "Filling..." : "Fill PDF and download"}
          </button>

          <Show when={fillState().status === "error"}>
            <p class="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {(fillState() as Extract<FillState, { status: "error" }>).message}
            </p>
          </Show>

          <Show when={fillState().status === "done"}>
            <Show
              when={(fillState() as Extract<FillState, { status: "done" }>).violations.length > 0}
              fallback={<p class="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Downloaded - no gate warnings.</p>}
            >
              <div class="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                <p class="font-medium">
                  Downloaded, but {(fillState() as Extract<FillState, { status: "done" }>).violations.length} gate
                  warning(s) found - the PDF's own logic says one of these fields shouldn't hold a value given its
                  gate's current answer:
                </p>
                <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto rounded bg-white/50 p-2 font-mono text-xs">
                  <For each={(fillState() as Extract<FillState, { status: "done" }>).violations}>{(v) => <li>{v}</li>}</For>
                </ul>
              </div>
            </Show>
          </Show>
        </div>
      </div>
    </main>
  );
}
