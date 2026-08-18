import type { DisplayRow } from "./displayRow";

// The collation step's working shape for this form: flat, one key per
// question, so a derive function can answer questions independently. It is
// deliberately not the nested FormData shape
// forms/income-and-assets/schema.ts expects - toIncomeAndAssetsBusinessInput
// below is the only place the two meet.
export interface IncomeAndAssetsDraft {
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

// Placeholder values for keys the derive step may not answer. A value here
// is only ever written to the PDF if that key is NOT in uncertainFields -
// otherwise it is dropped entirely by toIncomeAndAssetsBusinessInput.
export const DEFAULT_INCOME_AND_ASSETS_DRAFT: IncomeAndAssetsDraft = {
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

export const INCOME_AND_ASSETS_FIELD_LABELS: Record<keyof IncomeAndAssetsDraft, string> = {
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

const WORK_TYPE_DISPLAY: Record<IncomeAndAssetsDraft["workType"], string> = {
  FT: "Full time",
  PT: "Part time",
  Seasonal: "Seasonal",
  Casual: "Casual",
};

// Converts the draft into forms/income-and-assets/schema.ts's shape,
// dropping every key the collation step could not confidently answer. This
// is the single point where "we don't know" becomes "absent", which
// mapping.ts then honours by leaving that PDF field untouched - rather than
// writing a default that would read as a real answer.
export function toIncomeAndAssetsBusinessInput(
  draft: IncomeAndAssetsDraft,
  uncertain: ReadonlySet<keyof IncomeAndAssetsDraft>,
): unknown {
  let employment: unknown;
  if (uncertain.has("employed")) {
    employment = undefined; // no employment information at all
  } else if (draft.employed) {
    employment = {
      isEmployed: true,
      personWorking: uncertain.has("personWorking") ? undefined : draft.personWorking,
      workType: uncertain.has("workType") ? undefined : draft.workType,
      usualWage: uncertain.has("usualWage") ? undefined : draft.usualWage,
    };
  } else {
    employment = { isEmployed: false };
  }

  return {
    familyName: draft.familyName,
    firstName: draft.firstName,
    secondName: draft.secondName || undefined,
    clientReferenceNumber: draft.clientReferenceNumber,
    question4: uncertain.has("question4") ? undefined : draft.question4,
    employment,
  };
}

// Rows for the read-only extracted-data view. The employment sub-questions
// only appear when employment is both known and affirmative - matching what
// applyFormData will actually touch, so the view never claims relevance for
// a field the PDF leaves alone.
export function toIncomeAndAssetsDisplayRows(
  draft: IncomeAndAssetsDraft,
  uncertain: ReadonlySet<keyof IncomeAndAssetsDraft>,
): DisplayRow[] {
  const yesNo = (b: boolean) => (b ? "Yes" : "No");
  const rows: { key: keyof IncomeAndAssetsDraft; display: string }[] = [
    { key: "familyName", display: draft.familyName },
    { key: "firstName", display: draft.firstName },
    { key: "secondName", display: draft.secondName },
    { key: "clientReferenceNumber", display: draft.clientReferenceNumber },
    { key: "question4", display: yesNo(draft.question4) },
    { key: "employed", display: yesNo(draft.employed) },
  ];
  if (!uncertain.has("employed") && draft.employed) {
    rows.push(
      { key: "personWorking", display: draft.personWorking },
      { key: "workType", display: WORK_TYPE_DISPLAY[draft.workType] },
      { key: "usualWage", display: yesNo(draft.usualWage) },
    );
  }
  return rows.map((r) => ({
    label: INCOME_AND_ASSETS_FIELD_LABELS[r.key],
    value: r.display,
    needsReview: uncertain.has(r.key),
  }));
}
