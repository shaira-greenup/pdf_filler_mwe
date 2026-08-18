import type { DisplayRow } from "./displayRow";

// See incomeAndAssets.ts for why this flat draft shape stays separate from
// forms/abs-study/schema.ts's own FormData type.
export interface AbsStudyDraft {
  hasCitizenshipDetails: boolean;
  country: string;
  // ISO yyyy-mm-dd - matches z.iso.date() in schema.ts; mapping.ts is the
  // only place that reformats to the PDF's own DD MM YYYY comb field.
  date: string;
}

export const DEFAULT_ABS_STUDY_DRAFT: AbsStudyDraft = {
  hasCitizenshipDetails: false,
  country: "",
  date: "",
};

export const ABS_STUDY_FIELD_LABELS: Record<keyof AbsStudyDraft, string> = {
  hasCitizenshipDetails: "Citizenship / residency details apply",
  country: "Country",
  date: "Date",
};

// Q2 is only answered when the client record actually says so. A client
// with no citizenship information is "unknown", never "No" - nothing here
// can confirm a negative, so citizenship is omitted and mapping.ts leaves
// Q2 blank (see forms/abs-study/schema.ts).
export function toAbsStudyBusinessInput(
  draft: AbsStudyDraft,
  uncertain: ReadonlySet<keyof AbsStudyDraft>,
): unknown {
  if (uncertain.has("hasCitizenshipDetails") || !draft.hasCitizenshipDetails) {
    return {};
  }
  return {
    citizenship: {
      country: draft.country,
      date: uncertain.has("date") ? undefined : draft.date,
    },
  };
}

export function toAbsStudyDisplayRows(
  draft: AbsStudyDraft,
  uncertain: ReadonlySet<keyof AbsStudyDraft>,
): DisplayRow[] {
  const rows: { key: keyof AbsStudyDraft; display: string }[] = [
    { key: "hasCitizenshipDetails", display: draft.hasCitizenshipDetails ? "Yes" : "No" },
  ];
  if (!uncertain.has("hasCitizenshipDetails") && draft.hasCitizenshipDetails) {
    rows.push({ key: "country", display: draft.country }, { key: "date", display: draft.date });
  }
  return rows.map((r) => ({
    label: ABS_STUDY_FIELD_LABELS[r.key],
    value: r.display,
    needsReview: uncertain.has(r.key),
  }));
}
