import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const FamilySchema = z.enum(["codex", "xai"]);
export type Family = z.infer<typeof FamilySchema>;

export const AccountQuotaSchema = z.object({
  id: z.string(),
  family: FamilySchema,
  label: z.string(),
  plan: z.string().nullable(),
  usedPercent: z.number().nullable(),
  resetAt: z.number().nullable(),
  serviceable: z.boolean().nullable(),
  error: z.string().nullable(),
});
export type AccountQuota = z.infer<typeof AccountQuotaSchema>;

export const QuotaSnapshotSchema = z.object({
  families: z.record(
    FamilySchema,
    z.object({
      usedPercent: z.number().nullable(),
      accountCount: z.number(),
    }),
  ),
  accounts: z.array(AccountQuotaSchema),
  preferredId: z.string().nullable(),
  fetchedAt: z.number().nullable(),
});
export type QuotaSnapshot = z.infer<typeof QuotaSnapshotSchema>;

export const PrefsSchema = z.object({
  showCodex: z.boolean(),
  showGrok: z.boolean(),
});
export type Prefs = z.infer<typeof PrefsSchema>;

export const getQuota = defineRpc({
  name: "ttz.get",
  input: z.object({}),
  output: QuotaSnapshotSchema,
});

export const refreshQuota = defineRpc({
  name: "ttz.refresh",
  input: z.object({}),
  output: QuotaSnapshotSchema,
});

export const getPrefs = defineRpc({
  name: "ttz.prefs.get",
  input: z.object({}),
  output: PrefsSchema,
});

export const setPrefs = defineRpc({
  name: "ttz.prefs.set",
  input: PrefsSchema.partial(),
  output: PrefsSchema,
});

export const switchAccount = defineRpc({
  name: "ttz.switch",
  input: z.object({ id: z.string().min(1).max(80) }),
  output: QuotaSnapshotSchema,
});
