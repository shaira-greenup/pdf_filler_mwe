import { createResource, createSignal, For, Show } from "solid-js";
import { FORM_REGISTRY, listFormEntries } from "../lib/registry";
import { fillFormInBrowser } from "../lib/fillInBrowser";
import { downloadPdf } from "../lib/download";
import { listClients, type ClientRecord } from "../lib/clientDb";
import { deriveIncomeAndAssetsInput } from "../lib/deriveIncomeAndAssets";
import { deriveAbsStudyInput } from "../lib/deriveAbsStudy";
import UncertainFieldsSummary from "../components/UncertainFieldsSummary";
import FriendlyDataView from "../components/FriendlyDataView";
import type { DisplayRow } from "../forms/displayRow";
import {
  DEFAULT_INCOME_AND_ASSETS_DRAFT,
  toIncomeAndAssetsBusinessInput,
  toIncomeAndAssetsDisplayRows,
  type IncomeAndAssetsDraft,
} from "../forms/incomeAndAssets";
import {
  DEFAULT_ABS_STUDY_DRAFT,
  toAbsStudyBusinessInput,
  toAbsStudyDisplayRows,
  type AbsStudyDraft,
} from "../forms/absStudy";

type FormId = "income-and-assets" | "abs-study";

type FillState =
  | { status: "idle" }
  | { status: "filling" }
  | { status: "done"; violations: string[] }
  | { status: "error"; message: string };

const selectClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";
const sectionLabelClass = "text-sm font-medium text-slate-700";

export default function AutomateFillPage() {
  const [formId, setFormId] = createSignal<FormId>("income-and-assets");
  const [clients] = createResource(listClients);
  const [selectedClientId, setSelectedClientId] = createSignal<number | "">("");

  // Not wired to anything yet - a placeholder for a future step where an
  // actual model reads free text (meeting notes, extra context) as part of
  // collation. The dummy client DB's deterministic mapping doesn't consume
  // this; it exists so the pipeline's shape is visible before that piece
  // is real (see docs/20260818_browser-ui-mwe-plan.md).
  const [additionalInfo, setAdditionalInfo] = createSignal("");

  const [incomeDraft, setIncomeDraft] = createSignal(DEFAULT_INCOME_AND_ASSETS_DRAFT);
  const [incomeUncertain, setIncomeUncertain] = createSignal<ReadonlySet<keyof IncomeAndAssetsDraft>>(new Set());
  const [absDraft, setAbsDraft] = createSignal(DEFAULT_ABS_STUDY_DRAFT);
  const [absUncertain, setAbsUncertain] = createSignal<ReadonlySet<keyof AbsStudyDraft>>(new Set());

  const [fillState, setFillState] = createSignal<FillState>({ status: "idle" });

  const hasClient = () => selectedClientId() !== "";

  function rows(): DisplayRow[] {
    return formId() === "income-and-assets"
      ? toIncomeAndAssetsDisplayRows(incomeDraft(), incomeUncertain())
      : toAbsStudyDisplayRows(absDraft(), absUncertain());
  }

  function uncertainCount(): number {
    return formId() === "income-and-assets" ? incomeUncertain().size : absUncertain().size;
  }

  function handleSelectForm(e: Event & { currentTarget: HTMLSelectElement }) {
    setFormId(e.currentTarget.value as FormId);
    setFillState({ status: "idle" });
  }

  // "AI collation" step (deliberately simulated/deterministic for this MWE
  // - see docs/20260818_browser-ui-mwe-plan.md): derives both forms' drafts
  // from whichever client record was picked, and records which questions
  // neither derive function could confidently answer.
  function applyClient(client: ClientRecord | undefined) {
    if (!client) {
      setIncomeDraft(DEFAULT_INCOME_AND_ASSETS_DRAFT);
      setIncomeUncertain(new Set<keyof IncomeAndAssetsDraft>());
      setAbsDraft(DEFAULT_ABS_STUDY_DRAFT);
      setAbsUncertain(new Set<keyof AbsStudyDraft>());
      return;
    }
    const income = deriveIncomeAndAssetsInput(client);
    setIncomeDraft(income.value);
    setIncomeUncertain(new Set<keyof IncomeAndAssetsDraft>(income.uncertainFields));

    const abs = deriveAbsStudyInput(client);
    setAbsDraft(abs.value);
    setAbsUncertain(new Set<keyof AbsStudyDraft>(abs.uncertainFields));
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
  // fillInBrowser.ts). Uncertain questions are dropped by the
  // to*BusinessInput converters, so they reach the PDF as untouched fields
  // rather than defaulted answers.
  async function handleFill() {
    setFillState({ status: "filling" });
    try {
      const id = formId();
      const entry = FORM_REGISTRY[id];
      if (!entry) throw new Error(`${id} not found in registry`);
      const businessInput =
        id === "income-and-assets"
          ? toIncomeAndAssetsBusinessInput(incomeDraft(), incomeUncertain())
          : toAbsStudyBusinessInput(absDraft(), absUncertain());
      const { bytes, violations } = await fillFormInBrowser(entry, businessInput);
      downloadPdf(bytes, `${id}-filled.pdf`);
      setFillState({ status: "done", violations });
    } catch (err) {
      setFillState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <div class="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
      <h2 class="text-lg font-semibold text-slate-800">Automate filling out a form</h2>

      <label class="block">
        <span class={sectionLabelClass}>Form</span>
        <select value={formId()} onChange={handleSelectForm} class={selectClass}>
          <For each={listFormEntries()}>{(entry) => <option value={entry.id}>{entry.label}</option>}</For>
        </select>
      </label>

      <label class="block">
        <span class={sectionLabelClass}>Client (dummy CRM record)</span>
        <select value={selectedClientId()} onChange={handleSelectClient} class={selectClass}>
          <option value="">Select a client...</option>
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

      <label class="block">
        <span class={sectionLabelClass}>Do you have any additional information?</span>
        <textarea
          value={additionalInfo()}
          onInput={(e) => setAdditionalInfo(e.currentTarget.value)}
          rows={2}
          placeholder="Not used yet - a placeholder for when a real model reads meeting notes/context as part of collation."
          class={`${selectClass} resize-y`}
        />
      </label>

      <Show
        when={hasClient()}
        fallback={<p class="text-sm text-slate-500">Select a client to see what can be filled in automatically.</p>}
      >
        <FriendlyDataView title="Extracted from client record" rows={rows()} />
        <UncertainFieldsSummary count={uncertainCount()} />
      </Show>

      <button
        type="button"
        onClick={handleFill}
        disabled={fillState().status === "filling" || !hasClient()}
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
              warning(s) found - the PDF's own logic says one of these fields shouldn't hold a value given its gate's
              current answer:
            </p>
            <ul class="mt-2 max-h-48 space-y-1 overflow-y-auto rounded bg-white/50 p-2 font-mono text-xs">
              <For each={(fillState() as Extract<FillState, { status: "done" }>).violations}>{(v) => <li>{v}</li>}</For>
            </ul>
          </div>
        </Show>
      </Show>
    </div>
  );
}
