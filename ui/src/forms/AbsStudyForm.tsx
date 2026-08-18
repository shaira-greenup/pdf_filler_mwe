import { Show } from "solid-js";

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

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";
const labelClass = "text-sm font-medium text-slate-700";

export interface AbsStudyFormProps {
  value: AbsStudyFormValue;
  onChange: (value: AbsStudyFormValue) => void;
}

export default function AbsStudyForm(props: AbsStudyFormProps) {
  function set<K extends keyof AbsStudyFormValue>(key: K, val: AbsStudyFormValue[K]) {
    props.onChange({ ...props.value, [key]: val });
  }

  return (
    <div class="space-y-4">
      <label class="flex items-center gap-2">
        <input
          type="checkbox"
          checked={props.value.hasCitizenshipDetails}
          onChange={(e) => set("hasCitizenshipDetails", e.currentTarget.checked)}
          class="rounded border-slate-300"
        />
        <span class={labelClass}>Citizenship / residency details apply (Q2)</span>
      </label>

      <Show when={props.value.hasCitizenshipDetails}>
        <div class="space-y-3 rounded-md bg-slate-50 p-3">
          <label class="block">
            <span class={labelClass}>Country</span>
            <input
              type="text"
              value={props.value.country}
              onInput={(e) => set("country", e.currentTarget.value)}
              class={inputClass}
            />
          </label>

          <label class="block">
            <span class={labelClass}>Date</span>
            <input
              type="date"
              value={props.value.date}
              onInput={(e) => set("date", e.currentTarget.value)}
              class={inputClass}
            />
          </label>
        </div>
      </Show>
    </div>
  );
}
