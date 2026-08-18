import { Show } from "solid-js";

// Explains the "Needs your input" rows in FriendlyDataView. Deliberately
// does not offer to collect those answers here: they are left blank in the
// generated PDF, and the human completes them in a PDF reader - re-asking
// for them on screen would be double handling of something the PDF itself
// already supports (the user's own call).
export interface UncertainFieldsSummaryProps {
  count: number;
}

export default function UncertainFieldsSummary(props: UncertainFieldsSummaryProps) {
  return (
    <Show when={props.count > 0}>
      <p class="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        {props.count} question{props.count === 1 ? "" : "s"} couldn't be answered from the client record (marked "Needs
        your input" above). {props.count === 1 ? "It is" : "They are"} left blank in the PDF - download it and complete{" "}
        {props.count === 1 ? "that section" : "those sections"} in your PDF reader.
      </p>
    </Show>
  );
}
