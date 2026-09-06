import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const LoginStateSchema = z.object({
  id: z.string(), family: z.enum(["codex", "xai"]),
  status: z.enum(["starting", "waiting", "saving", "done", "error", "cancelled"]),
  url: z.string().nullable(), userCode: z.string().nullable(),
  acceptsCode: z.boolean(), error: z.string().nullable(),
});
export type LoginState = z.infer<typeof LoginStateSchema>;
export const startLogin = defineRpc({ name: "ttz.auth.start", input: z.object({ family: z.enum(["codex", "xai"]) }), output: LoginStateSchema });
export const loginStatus = defineRpc({ name: "ttz.auth.status", input: z.object({ id: z.string() }), output: LoginStateSchema });
export const submitLogin = defineRpc({ name: "ttz.auth.submit", input: z.object({ id: z.string(), code: z.string().min(1).max(8192) }), output: LoginStateSchema });
export const cancelLogin = defineRpc({ name: "ttz.auth.cancel", input: z.object({ id: z.string() }), output: LoginStateSchema });
