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

export type FormData = z.infer<typeof FormDataSchema>;
