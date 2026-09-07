import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { canArchiveAgent, isGameId, parseLsRemoteRefs, resolveLocalWorker, vendorCandidates, type GameNode, type HostLoad } from "./gamedev.shared";

type WorkerEntry = { id: string; host: string; providers: string[] };
type CoordinatorEntry = { agentId: string; name: string };

const FALLBACK_WORKERS: WorkerEntry[] = [
  { id: "mac81", host: "192.168.24.81:6767", providers: ["jili"] },
  { id: "mac82", host: "192.168.24.82:6767", providers: ["tada"] },
  { id: "mac83", host: "192.168.24.83:6767", providers: ["hacksaw"] },
];
const FALLBACK_COORD: CoordinatorEntry = {
  agentId: "a4cf6b15-8def-4f16-97bf-ddf0c3df6938",
  name: "游戏开发",
};

let cachedRoot: string | null = null;
function slotRoot(): string {
  if (cachedRoot) return cachedRoot;
  for (const cand of [join(homedir(), "projects/SlotGame"), join(homedir(), "Project/SlotGame")]) {
    try {
      if (existsSync(join(cand, ".git"))) {
        cachedRoot = cand;
        return cachedRoot;
      }
    } catch { /* next */ }
  }
  cachedRoot = join(homedir(), "Project/SlotGame");
  return cachedRoot;
}

let cachedIps: string[] | null = null;
function localIps(): string[] {
  if (cachedIps) return cachedIps;
  const out: string[] = [];
  try {
    for (const addrs of Object.values(networkInterfaces())) {
      for (const addr of addrs ?? []) {
        if (addr.family === "IPv4" && !addr.internal) out.push(addr.address);
      }
    }
  } catch { /* no interfaces */ }
  cachedIps = out;
  return out;
}

function topology(): { workers: WorkerEntry[]; coordinator: CoordinatorEntry } {
  try {
    const raw = readFileSync(
      join(slotRoot(), "scripts/workflow/paseo-workers.json"),
      "utf8",
    );
    const data = JSON.parse(raw) as {
      workers?: Array<{ id?: unknown; host?: unknown; providers?: unknown }>;
      developmentCoordinator?: { agentId?: unknown; name?: unknown };
    };
    const workers: WorkerEntry[] = [];
    if (Array.isArray(data.workers)) {
      for (const row of data.workers) {
        if (typeof row.id !== "string" || typeof row.host !== "string") continue;
        const providers = Array.isArray(row.providers)
          ? row.providers.filter((p): p is string => typeof p === "string")
          : [];
        workers.push({ id: row.id, host: row.host, providers });
      }
    }
    const coord = data.developmentCoordinator;
    const coordinator: CoordinatorEntry = {
      agentId: coord && typeof coord.agentId === "string" ? coord.agentId : FALLBACK_COORD.agentId,
      name: coord && typeof coord.name === "string" ? coord.name : FALLBACK_COORD.name,
    };
    if (workers.length > 0) return { workers, coordinator };
  } catch { /* fall through to compiled-in topology */ }
  return { workers: FALLBACK_WORKERS, coordinator: FALLBACK_COORD };
}

let cachedPassword: string | null = null;
function lanPassword(): string {
  if (cachedPassword) return cachedPassword;
  const fromEnv = process.env.PASEO_PASSWORD?.trim();
  if (fromEnv) {
    cachedPassword = fromEnv;
    return cachedPassword;
  }
  try {
    const file = readFileSync(join(homedir(), "Worker/.secrets/paseo-lan-password"), "utf8").trim();
    if (file) {
      cachedPassword = file;
      return cachedPassword;
    }
  } catch { /* no file; fall through */ }
  return "";
}

function paseoBin(): string {
  const candidates = [
    "/Applications/Paseo.app/Contents/Resources/bin/paseo",
    "/usr/local/bin/paseo",
  ];
  for (const path of candidates) {
    try {
      if (existsSync(path)) return path;
    } catch { /* next */ }
  }
  return "paseo";
}

function runPaseo(args: string[], opts?: { host?: string; timeoutMs?: number }): Promise<string> {
  // A --host pointing at this machine goes through the local socket instead:
  // no password needed and no TCP round-trip.
  const remote = opts?.host && !localIps().includes(opts.host.split(":")[0]);
  const full = remote ? [...args, "--host", opts.host as string] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(paseoBin(), full, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PASEO_PASSWORD: lanPassword() },
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("GAMEDEV_TIMEOUT"));
    }, opts?.timeoutMs ?? 25_000);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT" ? "GAMEDEV_NO_CLI" : `GAMEDEV_SPAWN_${error.code ?? "?"}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(err.trim().slice(0, 160) || `GAMEDEV_EXIT_${code ?? "?"}`));
    });
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

function mapNode(row: Record<string, unknown>, worker: WorkerEntry, jumpable: boolean): GameNode | null {
  const name = str(row, "name", "Name");
  if (!isGameId(name)) return null;
  const statusRaw = str(row, "status", "Status").toLowerCase();
  // `paseo ls --json` combines provider and model as "pi/xai/grok-4.6".
  const combined = str(row, "provider", "Provider");
  const slash = combined.indexOf("/");
  const model = slash >= 0 ? combined.slice(slash + 1) : str(row, "model", "Model");
  return {
    gameId: name,
    shortId: str(row, "shortId", "ShortId", "id", "Id"),
    agentId: str(row, "id", "Id"),
    hostId: worker.id,
    host: worker.host,
    provider: worker.providers[0] ?? "unknown",
    status: statusRaw || "unknown",
    model: model || null,
    title: null,
    pendingCount: 0,
    jumpable,
  };
}

async function listWorker(
  worker: WorkerEntry,
  jumpable: boolean,
  query: string,
  pending: Map<string, number>,
  titles: Map<string, RulesInfo>,
): Promise<{ nodes: GameNode[]; load: HostLoad }> {
  try {
    const raw = await runPaseo(["ls", "--json"], { host: worker.host });
    const parsed: unknown = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [];
    const nodes: GameNode[] = [];
    let running = 0;
    for (const item of rows) {
      const node = mapNode(asRecord(item), worker, jumpable);
      if (!node) continue;
      if (query && !node.gameId.toLowerCase().includes(query)) continue;
      if (node.status === "running") running += 1;
      node.title = titles.get(node.gameId)?.title ?? null;
      node.pendingCount = pending.get(node.gameId) ?? 0;
      nodes.push(node);
    }
    nodes.sort((a, b) => (a.gameId < b.gameId ? -1 : 1));
    return {
      nodes,
      load: { hostId: worker.id, host: worker.host, providers: worker.providers, total: nodes.length, running, error: null },
    };
  } catch (error) {
    return {
      nodes: [],
      load: {
        hostId: worker.id,
        host: worker.host,
        providers: worker.providers,
        total: 0,
        running: 0,
        error: error instanceof Error ? error.message.slice(0, 80) : "unreachable",
      },
    };
  }
}

export async function handleGamedevList(input: {
  query?: string;
}): Promise<{ nodes: GameNode[]; hosts: HostLoad[]; coordinator: { status: string; name: string } | null; mode: "local" | "global" }> {
  const { workers, coordinator } = topology();
  const query = input.query?.trim().toLowerCase() ?? "";
  const localIdx = resolveLocalWorker(localIps(), workers);
  // Local (worker) panels must never block on GitHub: their job is find + jump.
  // Pending-branch counts stay exclusive to the aggregator (global) view.
  const branchMap = localIdx >= 0
    ? new Map<string, string[]>()
    : await allGameBranches().catch(() => new Map<string, string[]>());
  const titles = await Promise.resolve().then(() => rulesIndex()).catch(() => new Map());
  const pending = new Map<string, number>();
  for (const [gameId, refs] of branchMap) pending.set(gameId, refs.length);
  if (localIdx >= 0) {
    const entry = await listWorker(workers[localIdx], true, query, pending, titles);
    return { nodes: entry.nodes, hosts: [entry.load], coordinator: null, mode: "local" };
  }
  const settled = await Promise.all(workers.map((worker) => listWorker(worker, false, query, pending, titles)));
  let coordStatus: { status: string; name: string } | null = null;
  try {
    const raw = await runPaseo(["inspect", coordinator.agentId, "--json"], { timeoutMs: 15_000 });
    const row = asRecord(JSON.parse(raw) as unknown);
    const status = str(row, "Status", "status").toLowerCase() || "unknown";
    coordStatus = { status, name: coordinator.name };
  } catch { coordStatus = null; }
  return {
    nodes: settled.flatMap((entry) => entry.nodes),
    hosts: settled.map((entry) => entry.load),
    coordinator: coordStatus,
    mode: "global",
  };
}

type RulesInfo = {
  title: string | null;
  provider: string;
  externalId: string | null;
  vendorId: string | null;
  path: string;
  summary: string | null;
};

let rulesCache: { at: number; byId: Map<string, RulesInfo> } | null = null;

function scanRules(): Map<string, RulesInfo> {
  const byId = new Map<string, RulesInfo>();
  const root = join(slotRoot(), "games");
  let providers: string[] = [];
  try {
    providers = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch { return byId; }
  for (const provider of providers) {
    let dirs: string[] = [];
    try {
      dirs = readdirSync(join(root, provider), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch { continue; }
    for (const dir of dirs) {
      const path = join(root, provider, dir, "GAME_RULES.md");
      if (!existsSync(path)) continue;
      let head = "";
      try {
        const full = readFileSync(path, "utf8");
        head = full.split("\n").slice(0, 90).join("\n");
      } catch { continue; }
      const idMatch = /Internal game ID:\s*`(\d{5,8})`/.exec(head);
      if (!idMatch) continue;
      const titleMatch = /^#\s+(.+)$/m.exec(head);
      const externalMatch = /External game ID:\s*`([^`]+)`/.exec(head);
      const vendorMatch = /Vendor game ID:\s*`([^`]+)`/.exec(head);
      const identityIdx = head.indexOf("## Identity");
      let summary: string | null = null;
      if (identityIdx >= 0) {
        summary = head
          .slice(identityIdx, identityIdx + 900)
          .split("\n")
          .filter((line) => !line.trim().startsWith("<!--"))
          .slice(0, 14)
          .join("\n")
          .trim()
          .slice(0, 900) || null;
      }
      byId.set(idMatch[1], {
        title: titleMatch ? titleMatch[1].trim().slice(0, 120) : null,
        provider,
        externalId: externalMatch ? externalMatch[1].trim() : null,
        vendorId: vendorMatch ? vendorMatch[1].trim() : null,
        path,
        summary,
      });
    }
  }
  return byId;
}

function rulesIndex(): Map<string, RulesInfo> {
  if (rulesCache && Date.now() - rulesCache.at < 10 * 60_000) return rulesCache.byId;
  const byId = scanRules();
  rulesCache = { at: Date.now(), byId };
  return byId;
}

async function allGameBranches(): Promise<Map<string, string[]>> {
  if (branchCache && Date.now() - branchCache.at < 60_000) return branchCache.map;
  const map = new Map<string, string[]>();
  const repo = slotRoot();
  if (existsSync(join(repo, ".git"))) {
    const refs = await new Promise<string[]>((resolve) => {
      const child = spawn(
        "git",
        ["-C", repo, "ls-remote", "--heads", "origin", "automation/game/*"],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let out = "";
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve([]); }, 12_000);
      child.stdout.on("data", (chunk) => { out += chunk; });
      child.on("error", () => { clearTimeout(timer); resolve([]); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) { resolve([]); return; }
        try { resolve(parseLsRemoteRefs(out)); } catch { resolve([]); }
      });
    });
    for (const ref of refs) {
      const match = /^automation\/game\/(\d{5,8})-/.exec(ref);
      if (!match) continue;
      const arr = map.get(match[1]);
      if (arr) arr.push(ref);
      else map.set(match[1], [ref]);
    }
  }
  branchCache = { at: Date.now(), map };
  return map;
}

let branchCache: { at: number; map: Map<string, string[]> } | null = null;

async function pendingBranches(gameId: string): Promise<string[]> {
  try {
    const map = await allGameBranches();
    return map.get(gameId) ?? [];
  } catch { return []; }
}

export async function handleGamedevDetail(input: { gameId: string; host: string; shortId?: string }): Promise<{
  gameId: string;
  provider: string;
  host: string;
  status: string;
  model: string | null;
  updatedAt: string | null;
  costUsd: number | null;
  title: string | null;
  externalId: string | null;
  vendorId: string | null;
  rulesPath: string | null;
  rulesSummary: string | null;
  rulesSource: "identity" | "vendor" | "none";
  pendingBranches: string[];
}> {
  const { workers } = topology();
  const worker = workers.find((entry) => entry.host === input.host) ?? workers[0];
  const provider = worker?.providers[0] ?? "unknown";
  let status = "unknown";
  let model: string | null = null;
  let updatedAt: string | null = null;
  let costUsd: number | null = null;
  try {
    // Inspect by short ID: game names are not unique (e.g. two agents named 6000103).
    const raw = await runPaseo(["inspect", input.shortId || input.gameId, "--json"], {
      host: input.host,
      timeoutMs: 15_000,
    });
    const row = asRecord(JSON.parse(raw) as unknown);
    status = str(row, "Status", "status").toLowerCase() || "unknown";
    model = str(row, "Model", "model") || null;
    updatedAt = str(row, "UpdatedAt", "updatedAt") || null;
    const usage = asRecord(row["LastUsage"] ?? row["lastUsage"]);
    const cost = usage["CostUsd"] ?? usage["costUsd"];
    if (typeof cost === "number") costUsd = Math.round(cost * 100) / 100;
  } catch { /*agent may be archived; rules + branches still useful*/ }
  const rules = rulesIndex().get(input.gameId);
  const branches = await pendingBranches(input.gameId);
  if (rules) {
    return {
      gameId: input.gameId,
      provider: rules.provider,
      host: input.host,
      status,
      model,
      updatedAt,
      costUsd,
      title: rules.title,
      externalId: rules.externalId,
      vendorId: rules.vendorId,
      rulesPath: rules.path,
      rulesSummary: rules.summary,
      rulesSource: "identity",
      pendingBranches: branches,
    };
  }
  const fallback = resolveByVendorDir(input.gameId, provider);
  return {
    gameId: input.gameId,
    provider: fallback?.provider ?? provider,
    host: input.host,
    status,
    model,
    updatedAt,
    costUsd,
    title: fallback?.title ?? null,
    externalId: fallback?.externalId ?? null,
    vendorId: fallback?.vendorId ?? null,
    rulesPath: fallback?.path ?? null,
    rulesSummary: fallback?.summary ?? null,
    rulesSource: fallback ? "vendor" : "none",
    pendingBranches: branches,
  };
}

function resolveByVendorDir(gameId: string, provider: string): {
  title: string | null;
  provider: string;
  externalId: string | null;
  vendorId: string;
  path: string;
  summary: string | null;
} | null {
  const root = join(slotRoot(), "games");
  const providers = provider !== "unknown" ? [provider] : ["jili", "tada", "hacksaw"];
  for (const prov of providers) {
    let dirs: string[] = [];
    try {
      dirs = readdirSync(join(root, prov), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const vendor of vendorCandidates(gameId)) {
      const dir = dirs.find((name) => name === vendor || name.startsWith(vendor + "_"));
      if (!dir) continue;
      const rulesPath = join(root, prov, dir, "GAME_RULES.md");
      if (!existsSync(rulesPath)) {
        return { title: null, provider: prov, externalId: dir, vendorId: vendor, path: join(root, prov, dir), summary: null };
      }
      let head = "";
      try {
        head = readFileSync(rulesPath, "utf8").split("\n").slice(0, 40).join("\n");
      } catch {
        head = "";
      }
      const titleMatch = /^#\s+(.+)$/m.exec(head);
      const summary = head
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("<!--"))
        .slice(0, 16)
        .join("\n")
        .trim()
        .slice(0, 900) || null;
      return {
        title: titleMatch ? titleMatch[1].trim().slice(0, 120) : null,
        provider: prov,
        externalId: dir,
        vendorId: vendor,
        path: rulesPath,
        summary,
      };
    }
  }
  return null;
}

export async function handleGamedevThread(input: { shortId: string; host: string; tail?: number }): Promise<{ text: string }> {
  const tail = Math.min(Math.max(input.tail ?? 30, 5), 100);
  const raw = await runPaseo(["--no-color", "logs", input.shortId, "--tail", String(tail)], {
    host: input.host,
    timeoutMs: 20_000,
  });
  const text = raw.trim().slice(-6000);
  return { text: text || "暂无动态" };
}

export async function handleGamedevArchive(input: { shortId: string; host: string }): Promise<{ ok: boolean }> {
  const raw = await runPaseo(["inspect", input.shortId, "--json"], {
    host: input.host,
    timeoutMs: 15_000,
  });
  const row = asRecord(JSON.parse(raw) as unknown);
  const name = str(row, "Name", "name");
  if (!canArchiveAgent(name)) throw new Error("GAMEDEV_REFUSE");
  const status = str(row, "Status", "status").toLowerCase();
  if (status === "running") throw new Error("GAMEDEV_RUNNING");
  await runPaseo(["archive", input.shortId], { host: input.host, timeoutMs: 20_000 });
  return { ok: true };
}

export async function handleGamedevDispatch(input: { text: string }): Promise<{ ok: boolean }> {
  const { coordinator } = topology();
  const text = input.text.trim();
  if (!text) throw new Error("GAMEDEV_EMPTY");
  await runPaseo(["send", coordinator.agentId, "--prompt", text], { timeoutMs: 30_000 });
  return { ok: true };
}
