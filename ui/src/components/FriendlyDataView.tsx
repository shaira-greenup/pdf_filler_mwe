import { For } from "solid-js";
import type { DisplayRow } from "../forms/displayRow";

// The primary, always-visible view of what the collation step extracted -
// plain label/value rows, no braces or quotes, so it reads like a summary
// a non-developer would actually want to look at (per the user's own
// framing: "people will get scared if it looks like code"). Replaces both
// a raw JSON dump and, for confidently-derived fields, the need to show
// them again as editable inputs - see AutomateFillPage.tsx.
export interface FriendlyDataViewProps {
  title: string;
  rows: DisplayRow[];
}

export default function FriendlyDataView(props: FriendlyDataViewProps) {
  return (
    <div class="rounded-md border border-slate-200 bg-white">
      <p class="border-b border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">{props.title}</p>
      <dl class="divide-y divide-slate-100">
        <For each={props.rows}>
          {(row) => (
            <div class="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt class="text-slate-500">{row.label}</dt>
              <dd class={row.needsReview ? "font-medium text-amber-700" : "text-slate-800"}>
                {row.needsReview ? "Needs your input" : row.value || "—"}
              </dd>
            </div>
          )}
        </For>
      </dl>
    </div>
  );
}
