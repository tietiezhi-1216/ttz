import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STORE = join(homedir(), ".paseo", "ttz.json");

const NAMES: Record<string, string> = {
  "openai-codex": "qq",
  "openai-codex-account-2": "hotmail",
  "openai-codex-account-3": "bess",
  xai: "1216",
  "xai-account-2": "2020",
};

const DEFAULTS: Record<string, string> = {
  "openai-codex": "gpt-5.6-sol",
  "openai-codex-account-2": "gpt-5.6-sol",
  "openai-codex-account-3": "gpt-5.6-sol",
  xai: "grok-4.6",
  "xai-account-2": "grok-4.6",
};

type Store = {
  preferredId?: string | null;
  names?: Record<string, string>;
};

function loadStore(): Store {
  try {
    return JSON.parse(readFileSync(STORE, "utf8")) as Store;
  } catch {
    return {};
  }
}

function savePreferred(id: string) {
  const next = { ...loadStore(), preferredId: id };
  writeFileSync(STORE, JSON.stringify(next, null, 2));
}

function resolveSlot(raw: string | undefined): string | null {
  if (!raw) return null;
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  for (const [id, name] of Object.entries({ ...NAMES, ...(loadStore().names ?? {}) })) {
    if (id.toLowerCase() === needle || name.toLowerCase() === needle) return id;
  }
  if (needle.startsWith("openai-codex") || needle.startsWith("xai")) return raw.trim();
  return null;
}

function labelOf(id: string): string {
  return loadStore().names?.[id] ?? NAMES[id] ?? id;
}

export default function (pi: any) {
  pi.registerCommand("ttz", {
    description: "铁铁汁切号：/ttz switch hotmail",
    getArgumentCompletions(prefix: string) {
      const items = [
        { value: "status", label: "status" },
        { value: "switch qq", label: "switch qq" },
        { value: "switch hotmail", label: "switch hotmail" },
        { value: "switch bess", label: "switch bess" },
        { value: "switch 1216", label: "switch 1216" },
        { value: "switch 2020", label: "switch 2020" },
      ];
      return items.filter((item) => item.value.startsWith(prefix));
    },
    async handler(args: string, ctx: any) {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const cmd = parts[0] || "status";
      if (cmd === "status" || cmd === "list") {
        const store = loadStore();
        const current = ctx.model
          ? `${ctx.model.provider}/${ctx.model.id}`
          : "(未知)";
        ctx.ui.notify(
          `铁铁汁\n当前会话：${current}\n记下的号：${store.preferredId ? labelOf(store.preferredId) : "无"}\n切号：/ttz switch hotmail`,
          "info",
        );
        return;
      }
      if (cmd === "switch" || cmd === "use") {
        const id = resolveSlot(parts.slice(1).join(" "));
        if (!id) {
          ctx.ui.notify("用法：/ttz switch qq|hotmail|bess|1216|2020", "warning");
          return;
        }
        const modelId = ctx.model?.provider?.startsWith(id.split("-")[0] ?? "")
          ? ctx.model.id
          : DEFAULTS[id];
        const model =
          ctx.modelRegistry?.find(id, modelId) ??
          ctx.modelRegistry?.find(id, DEFAULTS[id]);
        if (!model) {
          ctx.ui.notify(`找不到模型 ${id}/${modelId ?? ""}。先确认 auth.json 里有这个槽。`, "error");
          return;
        }
        const ok = await pi.setModel(model);
        if (!ok) {
          ctx.ui.notify(`无法切到 ${labelOf(id)}`, "error");
          return;
        }
        savePreferred(id);
        ctx.ui.notify(`已切到 ${labelOf(id)}（${id}）`, "info");
        return;
      }
      ctx.ui.notify("子命令：status | switch <短名>", "warning");
    },
  });

  pi.on("session_start", async (event: { reason?: string }, ctx: any) => {
    if (event?.reason === "resume") return;
    if (!existsSync(STORE)) return;
    const preferred = loadStore().preferredId;
    if (!preferred) return;
    if (ctx.model?.provider === preferred) return;
    const model =
      ctx.modelRegistry?.find(preferred, DEFAULTS[preferred]) ??
      ctx.modelRegistry?.find(preferred, ctx.model?.id);
    if (!model) return;
    await pi.setModel(model);
  });
}
