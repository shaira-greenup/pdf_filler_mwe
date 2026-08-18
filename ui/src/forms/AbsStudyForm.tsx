import { For, Show } from "solid-js";

// Flat UI state - see IncomeAndAssetsForm.tsx for why this stays separate
// from forms/abs-study/schema.ts's own "FormData" type (name collision with
// the DOM's global FormData, plus this component's own toggle-driven shape
// doesn't exist in the business schema at all).
export interface AbsStudyFormValue {
  hasCitizenshipDetails: boolean;
  country: string;
  // ISO yyyy-mm-dd - matches both z.iso.date() (schema.ts) and the native
  // value format of <input type="date">, so no reformatting is needed here;
  // mapping.ts is the only place that reformats to the PDF's own
  // DD MM YYYY comb field.
  date: string;
}

export const DEFAULT_ABS_STUDY_VALUE: AbsStudyFormValue = {
  hasCitizenshipDetails: false,
  country: "",
  date: "",
};

// Converts this component's flat UI state into the exact shape
// forms/abs-study/schema.ts's FormDataSchema expects. The toggle mirrors
// the PDF's own Q2 gate (see mapping.ts: Q2 "Yes" -> Q2Details.Country/
// Q2Details.Date revealed) collapsed into `citizenship: undefined` when
// off; validation itself (non-empty country, valid ISO date) happens once,
// at fill time, via FormDataSchema.parse.
export function toAbsStudyBusinessInput(value: AbsStudyFormValue): unknown {
  return {
    citizenship: value.hasCitizenshipDetails ? { country: value.country, date: value.date } : undefined,
  };
}

// See IncomeAndAssetsForm.tsx's FIELD_LABELS for why this exists - keeps
// the review-summary banner's wording in sync with whatever key
// deriveAbsStudy.ts flags.
const FIELD_LABELS: Record<keyof AbsStudyFormValue, string> = {
  hasCitizenshipDetails: "Citizenship / residency details",
  country: "Country",
  date: "Date",
};

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";
const labelClass = "text-sm font-medium text-slate-700";
const flaggedInputClass = "border-amber-400 ring-1 ring-amber-300";

const EMPTY_UNCERTAIN: ReadonlySet<keyof AbsStudyFormValue> = new Set();

export interface AbsStudyFormProps {
  value: AbsStudyFormValue;
  onChange: (value: AbsStudyFormValue) => void;
  // Field keys the "AI"/collation step (deriveAbsStudy.ts) couldn't
  // confidently derive from the client record - see IncomeAndAssetsForm.tsx.
  uncertainFields?: ReadonlySet<keyof AbsStudyFormValue>;
}

export default function AbsStudyForm(props: AbsStudyFormProps) {
  function set<K extends keyof AbsStudyFormValue>(key: K, val: AbsStudyFormValue[K]) {
    props.onChange({ ...props.value, [key]: val });
  }

  function isUncertain(key: keyof AbsStudyFormValue): boolean {
    return (props.uncertainFields ?? EMPTY_UNCERTAIN).has(key);
  }

  function fieldClass(key: keyof AbsStudyFormValue): string {
    return isUncertain(key) ? `${inputClass} ${flaggedInputClass}` : inputClass;
  }

  function ReviewBadge(key: keyof AbsStudyFormValue) {
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

      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={props.value.hasCitizenshipDetails}
          onChange={(e) => set("hasCitizenshipDetails", e.currentTarget.checked)}
          class="rounded border-slate-300"
        />
        <span class={labelClass}>
          Citizenship / residency details apply (Q2)
          {ReviewBadge("hasCitizenshipDetails")}
        </span>
      </label>

      <Show when={props.value.hasCitizenshipDetails}>
        <div class="space-y-3 rounded-md bg-slate-50 p-3">
          <label class="block">
            <span class={labelClass}>
              Country
              {ReviewBadge("country")}
            </span>
            <input
              type="text"
              value={props.value.country}
              onInput={(e) => set("country", e.currentTarget.value)}
              class={fieldClass("country")}
            />
          </label>

          <label class="block">
            <span class={labelClass}>
              Date
              {ReviewBadge("date")}
            </span>
            <input
              type="date"
              value={props.value.date}
              onInput={(e) => set("date", e.currentTarget.value)}
              class={fieldClass("date")}
            />
          </label>
        </div>
      </Show>
    </div>
  );
}
