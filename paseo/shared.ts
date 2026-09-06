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
  authType: z.string().nullable(),
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
  notice: z.string().nullable(),
});
export type QuotaSnapshot = z.infer<typeof QuotaSnapshotSchema>;

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

export const importAuth = defineRpc({
  name: "ttz.import",
  input: z.object({}),
  output: QuotaSnapshotSchema,
});

export const loginAccount = defineRpc({
  name: "ttz.login",
  input: z.object({ family: FamilySchema }),
  output: QuotaSnapshotSchema,
});

export const switchAccount = defineRpc({
  name: "ttz.switch",
  input: z.object({ id: z.string().min(1).max(80) }),
  output: QuotaSnapshotSchema,
});
