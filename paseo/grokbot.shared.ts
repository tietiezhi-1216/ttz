import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const GrokBotTargetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  title: z.string().nullable(),
  avatarShape: z.string().nullable(),
  avatarColor: z.string().nullable(),
  memberCount: z.number(),
  notify: z.boolean().nullable(),
  hidden: z.boolean().nullable(),
  busy: z.boolean().nullable(),
  unread: z.number().nullable(),
  lastPreview: z.string().nullable(),
  lastActiveAt: z.number().nullable(),
});
export type GrokBotTarget = z.infer<typeof GrokBotTargetSchema>;

export const GrokBotEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  author: z.enum(["you", "bot"]),
  sender: z.string().nullable(),
  content: z.string(),
  timestampMs: z.number().nullable(),
});
export type GrokBotEntry = z.infer<typeof GrokBotEntrySchema>;

export const grokbotList = defineRpc({
  name: "ttz.grokbot.list",
  input: z.object({}),
  output: z.object({ bots: z.array(GrokBotTargetSchema), groups: z.array(GrokBotTargetSchema) }),
});

export const grokbotThread = defineRpc({
  name: "ttz.grokbot.thread",
  input: z.object({ target: z.string().min(1).max(120), limit: z.number().int().min(1).max(100).optional() }),
  output: z.object({ id: z.string().nullable(), name: z.string(), entries: z.array(GrokBotEntrySchema) }),
});

export const grokbotSend = defineRpc({
  name: "ttz.grokbot.send",
  input: z.object({ target: z.string().min(1).max(120), message: z.string().min(1).max(8000) }),
  output: z.object({ ok: z.boolean() }),
});

export const grokbotCreate = defineRpc({
  name: "ttz.grokbot.create",
  input: z.object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(4000).optional(),
    title: z.string().trim().max(120).optional(),
    avatarShape: z.string().max(20).optional(),
    avatarColor: z.string().max(20).optional(),
  }),
  output: GrokBotTargetSchema,
});

export const grokbotUpdate = defineRpc({
  name: "ttz.grokbot.update",
  input: z.object({
    target: z.string().min(1).max(120),
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(4000).optional(),
    title: z.string().trim().max(120).optional(),
    avatarShape: z.string().max(20).optional(),
    avatarColor: z.string().max(20).optional(),
    notify: z.enum(["on", "off"]).optional(),
    hidden: z.enum(["on", "off"]).optional(),
  }),
  output: GrokBotTargetSchema,
});

export const grokbotDelete = defineRpc({
  name: "ttz.grokbot.delete",
  input: z.object({ target: z.string().min(1).max(120) }),
  output: z.object({ ok: z.boolean() }),
});

export const grokbotMarkRead = defineRpc({
  name: "ttz.grokbot.mark-read",
  input: z.object({ id: z.string().min(1).max(80) }),
  output: z.object({ ok: z.boolean() }),
});

export const GrokbotProfileSchema = z.object({
  name: z.string(),
  label: z.string(),
  savedAt: z.number(),
  bots: z.number(),
  fingerprint: z.string().nullable(),
});
export type GrokBotProfile = z.infer<typeof GrokbotProfileSchema>;

export const GrokbotProfilesSchema = z.object({
  active: z.string().nullable(),
  profiles: z.array(GrokbotProfileSchema),
  liveSavedAs: z.string().nullable(),
  hasLive: z.boolean(),
});

export const grokbotProfiles = defineRpc({
  name: "ttz.grokbot.profiles",
  input: z.object({}),
  output: GrokbotProfilesSchema,
});

export const grokbotSaveProfile = defineRpc({
  name: "ttz.grokbot.save-profile",
  input: z.object({}),
  output: GrokbotProfilesSchema,
});

export const grokbotSetProfile = defineRpc({
  name: "ttz.grokbot.set-profile",
  input: z.object({ name: z.string().max(40).nullable() }),
  output: GrokbotProfilesSchema,
});

export const grokbotDeleteProfile = defineRpc({
  name: "ttz.grokbot.delete-profile",
  input: z.object({ name: z.string().min(1).max(40) }),
  output: GrokbotProfilesSchema,
});
