import type { ClientRecord } from "./clientDb";
import type { DerivedResult } from "./derive";
import { DEFAULT_ABS_STUDY_DRAFT, type AbsStudyDraft } from "../forms/absStudy";

export function deriveAbsStudyInput(client: ClientRecord): DerivedResult<AbsStudyDraft> {
  const uncertain: (keyof AbsStudyDraft)[] = [];

  const country = client.Citizenship?.trim();

  if (!country) {
    // No citizenship on file is not a "No" - the record simply doesn't say.
    // Flagged so Q2 is left blank for the human rather than answered on a
    // guess (see forms/abs-study/schema.ts).
    uncertain.push("hasCitizenshipDetails");
  } else {
    // Country is confidently derived; nothing in the client record answers
    // "when" - no field resembling a grant/arrival date exists at all - so
    // this is always flagged whenever citizenship applies.
    uncertain.push("date");
  }

  const value: AbsStudyDraft = {
    hasCitizenshipDetails: Boolean(country),
    country: country ?? "",
    date: DEFAULT_ABS_STUDY_DRAFT.date,
  };

  return { value, uncertainFields: uncertain };
}
