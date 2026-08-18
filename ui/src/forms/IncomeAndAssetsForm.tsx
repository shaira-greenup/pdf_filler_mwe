import { For, Show } from "solid-js";

// Flat UI state, one field per control - deliberately not the nested
// FormData shape forms/income-and-assets/schema.ts expects (that type's own
// name, "FormData", also collides with the DOM's global FormData, another
// reason to keep this component's own shape separate and give it its own
// name). toIncomeAndAssetsBusinessInput below is the only place the two
// shapes meet.
export interface IncomeAndAssetsFormValue {
  familyName: string;
  firstName: string;
  secondName: string;
  clientReferenceNumber: string;
  question4: boolean;
  employed: boolean;
  personWorking: "You" | "Partner";
  workType: "FT" | "PT" | "Seasonal" | "Casual";
  usualWage: boolean;
}

export const DEFAULT_INCOME_AND_ASSETS_VALUE: IncomeAndAssetsFormValue = {
  familyName: "",
  firstName: "",
  secondName: "",
  clientReferenceNumber: "",
  question4: false,
  employed: false,
  personWorking: "You",
  workType: "FT",
  usualWage: false,
};

// Converts this component's flat UI state into the exact shape
// forms/income-and-assets/schema.ts's FormDataSchema expects. The
// "employed?" toggle is a pure UI convenience (mirrors the PDF's own Q8Q
// gate - see mapping.ts) collapsed into `employment: undefined` when off;
// actual validation (10-digit CRN, required names) happens once, at fill
// time, via FormDataSchema.parse itself - this function does no validation
// of its own, only reshaping.
export function toIncomeAndAssetsBusinessInput(value: IncomeAndAssetsFormValue): unknown {
  return {
    familyName: value.familyName,
    firstName: value.firstName,
    secondName: value.secondName || undefined,
    clientReferenceNumber: value.clientReferenceNumber,
    question4: value.question4,
    employment: value.employed
      ? { personWorking: value.personWorking, workType: value.workType, usualWage: value.usualWage }
      : undefined,
  };
}

// Human-readable labels for the review-summary banner - keyed the same as
// deriveIncomeAndAssets.ts's uncertainFields, so a field flagged there reads
// the same wherever it's mentioned.
const FIELD_LABELS: Record<keyof IncomeAndAssetsFormValue, string> = {
  familyName: "Family name",
  firstName: "First name",
  secondName: "Second name",
  clientReferenceNumber: "Client Reference Number",
  question4: "Question 4",
  employed: "Employment status",
  personWorking: "Who is working",
  workType: "Work type",
  usualWage: "Usual wage",
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";
const labelClass = "text-sm font-medium text-slate-700";
const flaggedInputClass = "border-amber-400 ring-1 ring-amber-300";

const EMPTY_UNCERTAIN: ReadonlySet<keyof IncomeAndAssetsFormValue> = new Set();

export interface IncomeAndAssetsFormProps {
  value: IncomeAndAssetsFormValue;
  onChange: (value: IncomeAndAssetsFormValue) => void;
  // Field keys the "AI"/collation step (deriveIncomeAndAssets.ts) couldn't
  // confidently derive from the client record - flagged inline rather than
  // mixed in silently with real data (see docs/20260818_browser-ui-mwe-
  // plan.md's "AI drafts, human reviews").
  uncertainFields?: ReadonlySet<keyof IncomeAndAssetsFormValue>;
}

export default function IncomeAndAssetsForm(props: IncomeAndAssetsFormProps) {
  function set<K extends keyof IncomeAndAssetsFormValue>(key: K, val: IncomeAndAssetsFormValue[K]) {
    props.onChange({ ...props.value, [key]: val });
  }

  function isUncertain(key: keyof IncomeAndAssetsFormValue): boolean {
    return (props.uncertainFields ?? EMPTY_UNCERTAIN).has(key);
  }

  function fieldClass(key: keyof IncomeAndAssetsFormValue): string {
    return isUncertain(key) ? `${inputClass} ${flaggedInputClass}` : inputClass;
  }

  function ReviewBadge(key: keyof IncomeAndAssetsFormValue) {
    return (
      <Show when={isUncertain(key)}>
        <span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Review</span>
      </Show>
    );
  }

  return (
    <div class="space-y-4">
      <Show when={(props.uncertainFields?.size ?? 0) > 0}>
        <div class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p class="font-medium">Please confirm - couldn't be derived from the client record:</p>
          <ul class="mt-1 list-disc pl-5">
            <For each={[...(props.uncertainFields ?? EMPTY_UNCERTAIN)]}>{(key) => <li>{FIELD_LABELS[key]}</li>}</For>
          </ul>
        </div>
      </Show>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class={labelClass}>
            Family name
            {ReviewBadge("familyName")}
          </span>
          <input
            type="text"
            value={props.value.familyName}
            onInput={(e) => set("familyName", e.currentTarget.value)}
            class={fieldClass("familyName")}
          />
        </label>
        <label class="block">
          <span class={labelClass}>
            First name
            {ReviewBadge("firstName")}
          </span>
          <input
            type="text"
            value={props.value.firstName}
            onInput={(e) => set("firstName", e.currentTarget.value)}
            class={fieldClass("firstName")}
          />
        </label>
      </div>

      <label class="block">
        <span class={labelClass}>
          Second name (optional)
          {ReviewBadge("secondName")}
        </span>
        <input
          type="text"
          value={props.value.secondName}
          onInput={(e) => set("secondName", e.currentTarget.value)}
          class={fieldClass("secondName")}
        />
      </label>

      <label class="block">
        <span class={labelClass}>
          Client Reference Number (10 digits)
          {ReviewBadge("clientReferenceNumber")}
        </span>
        <input
          type="text"
          inputmode="numeric"
          value={props.value.clientReferenceNumber}
          onInput={(e) => set("clientReferenceNumber", e.currentTarget.value)}
          class={`${fieldClass("clientReferenceNumber")} font-mono`}
        />
      </label>

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={props.value.question4}
          onChange={(e) => set("question4", e.currentTarget.checked)}
          class="rounded border-slate-300"
        />
        <span class={labelClass}>
          Question 4 (placeholder Yes/No question)
          {ReviewBadge("question4")}
        </span>
      </label>

      <label class="flex items-center gap-2 border-t border-slate-200 pt-4">
        <input
          type="checkbox"
          checked={props.value.employed}
          onChange={(e) => set("employed", e.currentTarget.checked)}
          class="rounded border-slate-300"
        />
        <span class={labelClass}>
          Is anyone employed?
          {ReviewBadge("employed")}
        </span>
      </label>

      <Show when={props.value.employed}>
        <div class="space-y-3 rounded-md bg-slate-50 p-3">
          <label class="block">
            <span class={labelClass}>
              Who is working?
              {ReviewBadge("personWorking")}
            </span>
            <select
              value={props.value.personWorking}
              onChange={(e) => set("personWorking", e.currentTarget.value as IncomeAndAssetsFormValue["personWorking"])}
              class={fieldClass("personWorking")}
            >
              <option value="You">You</option>
              <option value="Partner">Partner</option>
            </select>
          </label>

          <label class="block">
            <span class={labelClass}>
              Work type
              {ReviewBadge("workType")}
            </span>
            <select
              value={props.value.workType}
              onChange={(e) => set("workType", e.currentTarget.value as IncomeAndAssetsFormValue["workType"])}
              class={fieldClass("workType")}
            >
              <option value="FT">Full time</option>
              <option value="PT">Part time</option>
              <option value="Seasonal">Seasonal</option>
              <option value="Casual">Casual</option>
            </select>
          </label>

          <label class="flex items-center gap-2">
            <input
              type="checkbox"
              checked={props.value.usualWage}
              onChange={(e) => set("usualWage", e.currentTarget.checked)}
              class="rounded border-slate-300"
            />
            <span class={labelClass}>
              Usual wage?
              {ReviewBadge("usualWage")}
            </span>
          </label>
        </div>
      </Show>
    </div>
  );
}
