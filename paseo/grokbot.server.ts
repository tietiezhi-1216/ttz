import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { GrokBotEntry, GrokBotTarget } from "./grokbot.shared";
import type { GrokBotProfile } from "./grokbot.shared";

// Resolve the gbot CLI shipped with this plugin. The daemon bundles plugin code
// into a cache directory, so dependencies must be resolved via the registered
// installation path, not import.meta.url.
function gbotPath(): string {
  const envPath = process.env.GBOT_PATH?.trim();
  if (envPath && existsSync(envPath)) return envPath;
  try {
    const config = JSON.parse(readFileSync(join(homedir(), ".paseo/config.json"), "utf8"));
    const directory = config.plugins?.ttz?.path;
    if (typeof directory === "string") {
      const local = join(directory, "node_modules/.bin/gbot");
      if (existsSync(local)) return local;
    }
  } catch { /* fall through */ }
  return "gbot";
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch { /* find embedded JSON */ }
  for (const opener of ["[", "{"]) {
    const start = trimmed.indexOf(opener);
    if (start >= 0) {
      try { return JSON.parse(trimmed.slice(start)); } catch { /* next */ }
    }
  }
  throw new Error("GBOT_BAD_OUTPUT");
}

function runGbot(args: string[], timeoutMs = 30_000, live = false): Promise<unknown> {
  return (async () => {
    let env: NodeJS.ProcessEnv = process.env;
    if (!live) {
      try {
        const extra = await profileSessionEnv();
        if (Object.keys(extra).length > 0) env = { ...process.env, ...extra };
      } catch { /* fall back to live app session */ }
    }
    return spawnGbot(args, timeoutMs, env);
  })();
}

// Env credentials for the active profile, so gbot never depends on HOME
// (overriding HOME breaks the macOS keychain lookup gbot relies on).
async function profileSessionEnv(): Promise<Record<string, string>> {
  const name = activeProfileName();
  if (!name) return {};
  const session = await loadProfileSession(name);
  return {
    GROK_BOT_GATEWAY_URL: session.gatewayUrl,
    GROK_BOT_GATEWAY_TOKEN: session.gatewayToken,
    GROK_BOT_GATEWAY_HEADERS: JSON.stringify(session.headers ?? {}),
  };
}

async function loadProfileSession(name: string): Promise<{ gatewayUrl: string; gatewayToken: string; headers: Record<string, string> }> {
  const config = JSON.parse(readFileSync(join(homedir(), ".paseo/config.json"), "utf8"));
  const directory = config.plugins?.ttz?.path;
  if (typeof directory !== "string") throw new Error("GBOT_NO_SESSION");
  const mod = await import(pathToFileURL(join(directory, "node_modules/grok-bot-cli/src/app-session.js")).href) as {
    loadGrokBotGatewaySession: (options?: { home?: string }) => { gatewayUrl: string; gatewayToken: string; headers: Record<string, string> };
  };
  return mod.loadGrokBotGatewaySession({ home: profileHome(name) });
}

function spawnGbot(args: string[], timeoutMs: number, env: NodeJS.ProcessEnv): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(gbotPath(), [...args, "--json"], { stdio: ["ignore", "pipe", "pipe"], env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("GBOT_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(new Error(error.code === "ENOENT" ? "GBOT_MISSING" : `GBOT_SPAWN_${error.code ?? "UNKNOWN"}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try { resolve(parseJson(out)); } catch (e) { reject(e instanceof Error ? e : new Error("GBOT_BAD_OUTPUT")); }
      } else {
        reject(new Error(err.trim().slice(0, 200) || `GBOT_EXIT_${code ?? "UNKNOWN"}`));
      }
    });
  });
}

const PROFILE_ROOT = join(homedir(), ".paseo", "ttz-grokbot-profiles");
const PROFILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/;

function profileHome(name: string): string {
  if (!PROFILE_NAME_RE.test(name)) throw new Error("GBOT_PROFILE_NAME");
  return join(PROFILE_ROOT, name, "home");
}

function profileDescriptor(name: string): string {
  return join(profileHome(name), "Library/Application Support/Grok Bot/gateway-descriptor.json");
}

function liveDescriptor(): string {
  return join(homedir(), "Library/Application Support/Grok Bot/gateway-descriptor.json");
}

type TtzStore = { grokbotProfile?: string | null };

function readTtzStore(): TtzStore {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".paseo", "ttz.json"), "utf8")) as TtzStore;
  } catch {
    return {};
  }
}

function activeProfileName(): string | null {
  const name = readTtzStore().grokbotProfile ?? null;
  if (!name) return null;
  if (!PROFILE_NAME_RE.test(name) || !existsSync(profileDescriptor(name))) return null;
  return name;
}

function profileMeta(name: string): GrokBotProfile | null {
  try {
    const meta = JSON.parse(readFileSync(join(PROFILE_ROOT, name, "meta.json"), "utf8")) as Partial<GrokBotProfile>;
    if (typeof meta.label !== "string") return null;
    return {
      name,
      label: meta.label,
      savedAt: typeof meta.savedAt === "number" ? meta.savedAt : 0,
      bots: typeof meta.bots === "number" ? meta.bots : 0,
      fingerprint: typeof meta.fingerprint === "string" ? meta.fingerprint : null,
    };
  } catch {
    return null;
  }
}

export function grokbotProfilesPayload(): Promise<{ active: string | null; profiles: GrokBotProfile[]; liveSavedAs: string | null; hasLive: boolean }> {
  return (async () => {
    let entries: string[] = [];
    try {
      entries = readdirSync(PROFILE_ROOT);
    } catch { /* no profiles yet */ }
    const profiles = entries
      .map((name) => (PROFILE_NAME_RE.test(name) && existsSync(profileDescriptor(name)) ? profileMeta(name) : null))
      .filter((p): p is GrokBotProfile => p !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
    const hasLive = liveDescriptorExists();
    let liveSavedAs: string | null = null;
    if (hasLive) {
      try {
        const data: unknown = await gatewayPost("listAgents", {});
        const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
        const list = Array.isArray(data) ? data : Array.isArray(rec.agents) ? rec.agents : [];
        const ids = list
          .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).id : null))
          .filter((id): id is string => typeof id === "string")
          .sort();
        const fingerprint = ids.join(",");
        const match = profiles.find((p) => p.fingerprint === fingerprint);
        if (match) liveSavedAs = match.name;
      } catch { /* gateway unreachable: leave unknown */ }
    }
    return { active: activeProfileName(), profiles, liveSavedAs, hasLive };
  })();
}

function liveDescriptorExists(): boolean {
  try {
    const wrapped = JSON.parse(readFileSync(liveDescriptor(), "utf8")) as { entries?: Record<string, unknown> };
    return Object.values(wrapped.entries ?? {}).length === 1;
  } catch {
    return false;
  }
}

export async function handleGrokbotProfiles(): Promise<{ active: string | null; profiles: GrokBotProfile[]; liveSavedAs: string | null; hasLive: boolean }> {
  return grokbotProfilesPayload();
}

export async function handleGrokbotSaveProfile(): Promise<{ active: string | null; profiles: GrokBotProfile[]; liveSavedAs: string | null; hasLive: boolean }> {
  const live = liveDescriptor();
  if (!existsSync(live)) throw new Error("GBOT_NO_SESSION");
  const wrapped = JSON.parse(readFileSync(live, "utf8")) as { version?: unknown; entries?: Record<string, unknown> };
  const entries = Object.values(wrapped.entries ?? {});
  if (entries.length !== 1) throw new Error("GBOT_MULTI_ENTRY");
  let bots = 0;
  let fingerprint = "";
  try {
    const rows = (await runGbot(["bots", "list"], 30_000, true)) as unknown[];
    if (Array.isArray(rows)) bots = rows.length;
  } catch { /* count is informational */ }
  try {
    // Fingerprint covers bots AND groups so it matches the live check below.
    const data: unknown = await gatewayPost("listAgents", {});
    const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const all = Array.isArray(data) ? data : Array.isArray(rec.agents) ? rec.agents : [];
    fingerprint = all
      .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).id : null))
      .filter((id): id is string => typeof id === "string")
      .sort()
      .join(",");
  } catch { /* leave empty: treated as unknown */ }
  let name = "";
  for (let n = 1; n < 100; n += 1) {
    const candidate = `p${n}`;
    if (!existsSync(profileDescriptor(candidate))) {
      name = candidate;
      break;
    }
  }
  if (!name) throw new Error("GBOT_PROFILE_NAME");
  const at = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const label = `${bots}个Bot · ${at.getMonth() + 1}/${at.getDate()} ${pad(at.getHours())}:${pad(at.getMinutes())}存档`;
  const dest = profileDescriptor(name);
  mkdirSync(dirname(dest), { recursive: true, mode: 0o700 });
  copyFileSync(live, dest);
  chmodSync(dest, 0o600);
  writeFileSync(
    join(PROFILE_ROOT, name, "meta.json"),
    JSON.stringify({ label, savedAt: Date.now(), bots, fingerprint }),
    { mode: 0o600 },
  );
  chmodSync(join(PROFILE_ROOT, name, "meta.json"), 0o600);
  return grokbotProfilesPayload();
}

export async function handleGrokbotSetProfile(input: { name: string | null }): Promise<{ active: string | null; profiles: GrokBotProfile[]; liveSavedAs: string | null; hasLive: boolean }> {
  const storePath = join(homedir(), ".paseo", "ttz.json");
  let full: Record<string, unknown> = {};
  try {
    full = JSON.parse(readFileSync(storePath, "utf8")) as Record<string, unknown>;
  } catch { /* fresh install without store yet */ }
  if (input.name !== null) {
    if (!PROFILE_NAME_RE.test(input.name) || !existsSync(profileDescriptor(input.name))) throw new Error("GBOT_PROFILE_MISSING");
    full.grokbotProfile = input.name;
  } else {
    delete full.grokbotProfile;
  }
  writeFileSync(storePath, JSON.stringify(full, null, 2), { mode: 0o600 });
  chmodSync(storePath, 0o600);
  return grokbotProfilesPayload();
}

export async function handleGrokbotDeleteProfile(input: { name: string }): Promise<{ active: string | null; profiles: GrokBotProfile[]; liveSavedAs: string | null; hasLive: boolean }> {
  if (!PROFILE_NAME_RE.test(input.name)) throw new Error("GBOT_PROFILE_NAME");
  rmSync(join(PROFILE_ROOT, input.name), { recursive: true, force: true });
  return grokbotProfilesPayload();
}
function mapTarget(item: unknown): GrokBotTarget | null {
  const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const id = typeof row.id === "string" ? row.id : "";
  const name = typeof row.name === "string" ? row.name : "";
  if (!id || !name) return null;
  const busyFlags = [row.isRunning, row.isComposingMessage, row.isRunningTurn].filter((v): v is boolean => typeof v === "boolean");
  return {
    id,
    name,
    description: typeof row.description === "string" ? row.description : null,
    title: typeof row.title === "string" ? row.title : null,
    avatarShape: typeof row.avatarShape === "string" && row.avatarShape ? row.avatarShape : null,
    avatarColor: typeof row.avatarColor === "string" && row.avatarColor ? row.avatarColor : null,
    memberCount: Array.isArray(row.members) ? row.members.length : 0,
    notify: typeof row.notifyOnAgentUpdates === "boolean" ? row.notifyOnAgentUpdates : null,
    hidden: typeof row.hiddenFromSidebar === "boolean" ? row.hiddenFromSidebar : null,
    busy: busyFlags.length > 0 ? busyFlags.some((v) => v) : null,
    unread: typeof row.unreadCount === "number" ? row.unreadCount : null,
    lastPreview: null,
    lastActiveAt: null,
  };
}

function targets(value: unknown): GrokBotTarget[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => mapTarget(item)).filter((row): row is GrokBotTarget => row !== null);
}

export async function handleGrokbotList(): Promise<{ bots: GrokBotTarget[]; groups: GrokBotTarget[] }> {
  const [bots, groups, status] = await Promise.all([
    runGbot(["bots", "list"]).then((value) => targets(value)),
    runGbot(["groups", "list"]).then((value) => targets(value)).catch(() => []),
    fetchAgentStatus(),
  ]);
  for (const row of [...bots, ...groups]) {
    const live = status.get(row.id);
    if (!live) continue;
    row.busy = live.busy;
    row.unread = live.unread;
    row.lastPreview = live.preview;
    row.lastActiveAt = live.activeAt;
  }
  return { bots, groups };
}

type AgentStatus = { busy: boolean | null; unread: number | null; preview: string | null; activeAt: number | null };

type GatewaySession = { gatewayUrl: string; gatewayToken: string; headers: Record<string, string> };

async function loadGatewaySession(): Promise<GatewaySession> {
  const config = JSON.parse(readFileSync(join(homedir(), ".paseo/config.json"), "utf8"));
  const directory = config.plugins?.ttz?.path;
  if (typeof directory !== "string") throw new Error("GBOT_NO_SESSION");
  const mod = await import(pathToFileURL(join(directory, "node_modules/grok-bot-cli/src/app-session.js")).href) as {
    loadGrokBotGatewaySession: () => GatewaySession;
  };
  return mod.loadGrokBotGatewaySession();
}

async function gatewayPost(method: string, body: Record<string, unknown>): Promise<unknown> {
  const session = await loadGatewaySession();
  const response = await fetch(`${session.gatewayUrl}/api/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${session.gatewayToken}`, ...session.headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// gbot's list output drops live status fields, so read them from the gateway directly.
async function fetchAgentStatus(): Promise<Map<string, AgentStatus>> {
  const out = new Map<string, AgentStatus>();
  try {
    const data: unknown = await gatewayPost("listAgents", {});
    const rec = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const list = Array.isArray(data) ? data : Array.isArray(rec.agents) ? rec.agents : [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const agent = item as Record<string, unknown>;
      if (typeof agent.id !== "string") continue;
      const flags = [agent.isRunning, agent.isComposingMessage, agent.isRunningTurn].filter((v): v is boolean => typeof v === "boolean");
      const preview = typeof agent.lastMessagePreview === "string" && agent.lastMessagePreview.trim()
        ? agent.lastMessagePreview.trim().slice(0, 120)
        : null;
      out.set(agent.id, {
        busy: flags.length > 0 ? flags.some((v) => v) : null,
        unread: typeof agent.unreadCount === "number" ? agent.unreadCount : null,
        preview,
        activeAt: typeof agent.lastActivityAt === "number" && agent.lastActivityAt > 0 ? agent.lastActivityAt : null,
      });
    }
  } catch { /* status is best-effort; roster still works without it */ }
  return out;
}

export async function handleGrokbotMarkRead(input: { id: string }): Promise<{ ok: boolean }> {
  await gatewayPost("setAgentUnread", { id: input.id, isUnread: false });
  return { ok: true };
}

export async function handleGrokbotThread(input: { target: string; limit?: number }): Promise<{ id: string | null; name: string; entries: GrokBotEntry[] }> {
  const body = await runGbot(["thread", input.target, "--limit", String(input.limit ?? 30)]) as Record<string, unknown>;
  const target = body.target && typeof body.target === "object" ? body.target as Record<string, unknown> : {};
  const transcript = body.transcript && typeof body.transcript === "object" ? body.transcript as Record<string, unknown> : {};
  const entries = Array.isArray(transcript.entries) ? transcript.entries : [];
  return {
    id: typeof target.id === "string" ? target.id : null,
    name: typeof target.name === "string" && target.name ? target.name : input.target,
    entries: entries.map((raw) => {
      const entry = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const message = entry.message && typeof entry.message === "object" ? entry.message as Record<string, unknown> : {};
      const fromAgent = entry.fromAgent && typeof entry.fromAgent === "object" ? entry.fromAgent as Record<string, unknown> : {};
      const sender = typeof fromAgent.name === "string" && fromAgent.name ? fromAgent.name : null;
      const role = typeof entry.role === "string" ? entry.role : "";
      // kind "message" carries role + fromAgent + string content;
      // kind "send-message" is the gateway's bot-side message without role info.
      const content = typeof entry.content === "string" && entry.content
        ? entry.content
        : typeof message.content === "string" ? message.content : "";
      const author = sender ? "bot" as const : role === "user" ? "you" as const : "bot" as const;
      return {
        id: typeof entry.id === "string" ? entry.id : "",
        kind: typeof entry.kind === "string" ? entry.kind : "",
        author,
        sender,
        content,
        timestampMs: typeof entry.timestampMs === "number" ? entry.timestampMs : null,
      };
    }).filter((entry) => entry.id && entry.content),
  };
}

export async function handleGrokbotSend(input: { target: string; message: string }): Promise<{ ok: boolean }> {
  await runGbot(["send", input.target, input.message]);
  return { ok: true };
}

export async function handleGrokbotCreate(input: { name: string; description?: string; title?: string; avatarShape?: string; avatarColor?: string }): Promise<GrokBotTarget> {
  const args = ["bots", "create", "--name", input.name];
  if (input.description) args.push("--description", input.description);
  if (input.title) args.push("--title", input.title);
  if (input.avatarShape) args.push("--avatar-shape", input.avatarShape);
  if (input.avatarColor) args.push("--avatar-color", input.avatarColor);
  const created = mapTarget(await runGbot(args));
  if (!created) throw new Error("GBOT_BAD_OUTPUT");
  return created;
}

export async function handleGrokbotUpdate(input: { target: string; name?: string; description?: string; title?: string; avatarShape?: string; avatarColor?: string; notify?: "on" | "off"; hidden?: "on" | "off" }): Promise<GrokBotTarget> {
  const args = ["bots", "update", input.target];
  if (input.name) args.push("--name", input.name);
  if (input.description !== undefined) args.push("--description", input.description);
  if (input.title !== undefined) args.push("--title", input.title);
  if (input.avatarShape) args.push("--avatar-shape", input.avatarShape);
  if (input.avatarColor) args.push("--avatar-color", input.avatarColor);
  if (input.notify) args.push("--notify", input.notify);
  if (input.hidden) args.push("--hidden", input.hidden);
  const updated = mapTarget(await runGbot(args));
  if (!updated) throw new Error("GBOT_BAD_OUTPUT");
  return updated;
}

export async function handleGrokbotDelete(input: { target: string }): Promise<{ ok: boolean }> {
  await runGbot(["bots", "delete", input.target]);
  return { ok: true };
}
