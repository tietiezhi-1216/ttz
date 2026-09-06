import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";
export const checkUpdates = defineRpc({
  name: "ttz.update.check",
  input: z.object({}),
  output: z.object({ current: z.string(), latest: z.string(), available: z.boolean() }),
});
