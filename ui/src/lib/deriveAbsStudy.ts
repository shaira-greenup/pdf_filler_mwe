import type { ClientRecord } from "./clientDb";
import type { DerivedResult } from "./derive";
import { DEFAULT_ABS_STUDY_VALUE, type AbsStudyFormValue } from "../forms/AbsStudyForm";

export function deriveAbsStudyInput(client: ClientRecord): DerivedResult<AbsStudyFormValue> {
  const uncertain: (keyof AbsStudyFormValue)[] = [];

  const country = client.Citizenship?.trim();
  const hasCitizenshipDetails = Boolean(country);

  if (hasCitizenshipDetails) {
    // Country is confidently derived; nothing in the client record answers
    // "when" - no field resembling a grant/arrival date exists at all -
    // so this is always flagged whenever citizenship applies.
    uncertain.push("date");
  }

  const value: AbsStudyFormValue = {
    hasCitizenshipDetails,
    country: country ?? "",
    date: DEFAULT_ABS_STUDY_VALUE.date,
  };

  return { value, uncertainFields: uncertain };
}
