import { z } from "zod";

export const FormDataSchema = z.object({
  familyName: z.string().min(1),
  firstName: z.string().min(1),
  secondName: z.string().optional(),
  clientReferenceNumber: z.string().regex(/^\d{10}$/, "must be exactly 10 digits"),
  question4: z.boolean(),
  employment: z
    .object({
      personWorking: z.enum(["You", "Partner"]),
      workType: z.enum(["FT", "PT", "Seasonal", "Casual"]),
      usualWage: z.boolean(),
    })
    .optional(),
});

// Everything else in fixtures/sample-data.json - every real PDF field we
// haven't given a business-meaningful name to - sits flat at the root,
// alongside these declared keys. fill.ts splits the raw JSON by checking
// each key against Object.keys(FormDataSchema.shape): a declared key goes
// through this schema; anything else goes through genericFields.ts's
// buildGenericSchema(form), which needs the loaded PDF to know each field's
// real shape (export values, MaxLength) - that's why it isn't validated
// here.

export type FormData = z.infer<typeof FormDataSchema>;
