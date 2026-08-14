import { z } from "zod";

// Q2 gates Q2Details.Country/Q2Details.Date - both Hidden by default,
// revealed only when the answer is "Yes". Confirmed from the form's own
// logic, not guessed from the field's label: DummyCalcQ2's Calculate action
// reads lockUnlockNoYes(this.getField("Q2"), "Yes", "Q2Details") - the exact
// trigger value the form's original author wired up. The date field is a
// single Comb(10) text field; its own Format/Keystroke actions
// (AFDate_FormatEx("dd mm yyyy")) confirm the exact on-the-wire shape:
// "DD MM YYYY", two literal space separators, zero-padded. citizenship.date
// is kept as a plain ISO string (YYYY-MM-DD) at the schema boundary and
// reformatted for the PDF in mapping.ts - see toDdMmYyyy/fromDdMmYyyy.
export const FormDataSchema = z.object({
  citizenship: z
    .object({
      country: z.string().min(1),
      date: z.iso.date(),
    })
    .optional(),
});

export type FormData = z.infer<typeof FormDataSchema>;
