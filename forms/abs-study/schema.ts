import { z } from "zod";

// Q2 ("Were you born in Australia?") gates Q2Details.Country/Q2Details.Date -
// both Hidden by default, revealed only when the answer is "No". The date
// field is a single Comb(10) text field; its own Format/Keystroke actions
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
