import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const GameNodeSchema = z.object({
  gameId: z.string(),
  shortId: z.string(),
  agentId: z.string(),
  hostId: z.string(),
  host: z.string(),
  provider: z.string(),
  status: z.string(),
  model: z.string().nullable(),
  title: z.string().nullable(),
  pendingCount: z.number().int().min(0),
  jumpable: z.boolean(),
});
export type GameNode = z.infer<typeof GameNodeSchema>;

export const HostLoadSchema = z.object({
  hostId: z.string(),
  host: z.string(),
  providers: z.array(z.string()),
  total: z.number(),
  running: z.number(),
  error: z.string().nullable(),
});
export type HostLoad = z.infer<typeof HostLoadSchema>;

export const gamedevList = defineRpc({
  name: "ttz.gamedev.list",
  input: z.object({ query: z.string().trim().max(60).optional() }),
  output: z.object({
    nodes: z.array(GameNodeSchema),
    hosts: z.array(HostLoadSchema),
    coordinator: z.object({ status: z.string(), name: z.string() }).nullable(),
    mode: z.enum(["local", "global"]),
  }),
});

export const gamedevDetail = defineRpc({
  name: "ttz.gamedev.detail",
  input: z.object({
    gameId: z.string().min(1).max(20),
    host: z.string().min(1).max(64),
    shortId: z.string().min(1).max(32).optional(),
  }),
  output: z.object({
    gameId: z.string(),
    provider: z.string(),
    host: z.string(),
    status: z.string(),
    model: z.string().nullable(),
    updatedAt: z.string().nullable(),
    costUsd: z.number().nullable(),
    title: z.string().nullable(),
    externalId: z.string().nullable(),
    vendorId: z.string().nullable(),
    rulesPath: z.string().nullable(),
    rulesSummary: z.string().nullable(),
    rulesSource: z.enum(["identity", "vendor", "none"]),
    pendingBranches: z.array(z.string()),
  }),
});

export const gamedevThread = defineRpc({
  name: "ttz.gamedev.thread",
  input: z.object({
    shortId: z.string().min(1).max(32),
    host: z.string().min(1).max(64),
    tail: z.number().int().min(5).max(100).optional(),
  }),
  output: z.object({ text: z.string() }),
});
export const gamedevArchive = defineRpc({
  name: "ttz.gamedev.archive",
  input: z.object({
    shortId: z.string().min(1).max(32),
    host: z.string().min(1).max(64),
  }),
  output: z.object({ ok: z.boolean() }),
});

export const gamedevDispatch = defineRpc({
  name: "ttz.gamedev.dispatch",
  input: z.object({ text: z.string().trim().min(1).max(2000) }),
  output: z.object({ ok: z.boolean() }),
});

// Group `automation/game/<gameId>-<stamp>` refs into pending counts per game.
// The list RPC fetches all temp branches in one `git ls-remote` call.
export function groupPendingBranches(refs: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const ref of refs) {
    const match = /^automation\/game\/(\d{5,8})-/.exec(ref);
    if (!match) continue;
    out.set(match[1], (out.get(match[1]) ?? 0) + 1);
  }
  return out;
}
// Which registry worker (if any) is this daemon? Match local IPv4s against the
// configured worker hosts so every install runs the same code: workers serve a
// fast local-only panel (jump always works), the coordinator host aggregates.
export function resolveLocalWorker(localIps: string[], workers: Array<{ id: string; host: string }>): number {
  for (let i = 0; i < workers.length; i++) {
    const ip = workers[i].host.split(":")[0];
    if (ip && localIps.includes(ip)) return i;
  }
  return -1;
}

// Safety rail for destructive actions: only numeric game agents may be archived
// from this panel. Coordinator / functional agents are never valid targets.
export function canArchiveAgent(name: string): boolean {
  return isGameId(name);
}

// Internal IDs look like 6000543 (jili) or 8000109 (tada): the vendor game ID
// is the trailing digits, e.g. 543 or 109. Try longest match first.
export function vendorCandidates(gameId: string): string[] {
  const out: string[] = [];
  for (const len of [5, 4, 3]) {
    if (gameId.length < len) continue;
    const stripped = gameId.slice(-len).replace(/^0+/, "");
    const cand = stripped || "0";
    if (!out.includes(cand)) out.push(cand);
  }
  return out;
}

export function isGameId(name: string): boolean {
  return /^\d{5,8}$/.test(name);
}

// Parse `git ls-remote --heads` output into ref short names.
export function parseLsRemoteRefs(raw: string): string[] {
  const out: string[] = [];
  for (const line of raw.split("\n")) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const ref = line.slice(tab + 1).trim();
    const prefix = "refs/heads/";
    if (ref.startsWith(prefix)) out.push(ref.slice(prefix.length));
  }
  return out;
}
