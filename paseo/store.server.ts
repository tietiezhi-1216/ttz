import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AccountQuota, Family, QuotaSnapshot } from "./shared";
import { loadOAuth } from "./auth-flow.server";
import { ensureCredential, sameCredential } from "./credential-refresh.server";

const STORE_PATH = join(homedir(), ".paseo", "ttz.json");
const AUTH_PATH = join(homedir(), ".pi/agent/auth.json");

const LIVE_KEY: Record<Family, string> = {
  codex: "openai-codex",
  xai: "xai",
  go: "opencode-go",
};

type UsageRow = {
  account?: string;
  plan?: string;
  windows?: Array<{ label: string; usedPercent: number; resetAt: number }>;
  serviceable?: boolean;
  primary?: { usedPercent?: number; resetAt?: number };
  secondary?: { usedPercent?: number; resetAt?: number };
};

type StoredAccount = {
  id: string;
  family: Family;
  label: string;
  cred: Record<string, unknown>;
  usage?: UsageRow;
  error?: string;
};

type Store = {
  preferred: { codex: string | null; xai: string | null; go: string | null };
  accounts: StoredAccount[];
  fetchedAt: number | null;
};

function familyOfSlot(id: string): Family | null {
  if (id === "openai-codex" || id.startsWith("openai-codex-account-")) return "codex";
  if (id === "xai" || id.startsWith("xai-account-")) return "xai";
  if (id === "opencode-go" || id.startsWith("opencode-go-account-")) return "go";
  return null;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

function readStore(): Store {
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<Store> & {
      preferredId?: string | null;
    };
    const legacyId = typeof raw.preferredId === "string" ? raw.preferredId : null;
    const preferred = {
      codex: raw.preferred?.codex ?? null,
      xai: raw.preferred?.xai ?? null,
      go: raw.preferred?.go ?? null,
    };
    if (legacyId) {
      const family = familyOfSlot(legacyId);
      if (family && !preferred[family]) preferred[family] = legacyId;
    }
    return {
      preferred,
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      fetchedAt: raw.fetchedAt ?? null,
    };
  } catch {
    return { preferred: { codex: null, xai: null, go: null }, accounts: [], fetchedAt: null };
  }
}

function writeStore(store: Store) {
  writeJson(STORE_PATH, store);
}

function credKey(cred: Record<string, unknown>): string {
  const access = typeof cred.access === "string" ? cred.access.slice(-12) : "";
  const refresh = typeof cred.refresh === "string" ? cred.refresh.slice(-12) : "";
  const accountId = typeof cred.accountId === "string" ? cred.accountId : "";
  const key = typeof cred.key === "string" ? cred.key.slice(-12) : "";
  return [cred.type, accountId, access, refresh, key].join(":");
}

function liveSlotId(store: Store, family: Family): string | null {
  try {
    const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Record<string, unknown>;
    const live = rec(auth[LIVE_KEY[family]]);
    if (!Object.keys(live).length) return store.preferred[family];
    const needle = credKey(live);
    const match = store.accounts.find((account) => account.family === family && credKey(account.cred) === needle);
    return match?.id ?? store.preferred[family];
  } catch {
    return store.preferred[family];
  }
}

function snapshot(store: Store, notice: string | null = null): QuotaSnapshot {
  const accounts: AccountQuota[] = store.accounts.map((account) => {
    const window = account.usage?.secondary ?? account.usage?.primary;
    const used = window?.usedPercent;
    return {
      id: account.id,
      family: account.family,
      label: account.label,
      plan: account.usage?.plan ?? null,
      usedPercent: !account.error && typeof used === "number" ? Math.round(used) : null,
      resetAt: !account.error && typeof window?.resetAt === "number" ? window.resetAt : null,
      serviceable: typeof account.usage?.serviceable === "boolean" ? account.usage.serviceable : null,
      error: account.error ?? null,
      authType: typeof account.cred.type === "string" ? account.cred.type : null,
      expiresAt: epochMs(account.cred.expires) ?? null,
      windows: account.error ? [] : account.usage?.windows ?? [],
    };
  });
  const familySummary = (family: Family) => {
    const rows = accounts.filter((a) => a.family === family);
    const live = rows.find((a) => a.id === liveSlotId(store, family));
    const percents = rows.map((a) => a.usedPercent).filter((n): n is number => n !== null);
    return {
      usedPercent: live?.usedPercent ?? (percents.length ? Math.min(...percents) : null),
      accountCount: rows.length,
    };
  };
  return {
    families: { codex: familySummary("codex"), xai: familySummary("xai"), go: familySummary("go") },
    accounts,
    preferred: {
      codex: liveSlotId(store, "codex"),
      xai: liveSlotId(store, "xai"),
      go: liveSlotId(store, "go"),
    },
    fetchedAt: store.fetchedAt,
    notice,
  };
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function pct(value: unknown): number | undefined {
  const n = num(value);
  return n === undefined ? undefined : Math.min(100, Math.max(0, n));
}

function epochMs(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim() && !Number.isFinite(Number(value))) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const n = num(value);
  if (n === undefined || n <= 0) return undefined;
  return n < 10_000_000_000 ? n * 1000 : n;
}

function usageWindow(value: unknown) {
  const source = rec(value);
  const usedPercent = pct(source.used_percent ?? source.utilization);
  const resetAt = epochMs(source.reset_at ?? source.resets_at);
  if (usedPercent === undefined || resetAt === undefined) return undefined;
  return { usedPercent, resetAt };
}

async function fetchCodex(cred: Record<string, unknown>): Promise<UsageRow> {
  const access = typeof cred.access === "string" ? cred.access : undefined;
  if (!access) throw new Error("不是 OAuth，无法拉额度");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${access}`,
    Accept: "application/json",
  };
  if (typeof cred.accountId === "string") headers["ChatGPT-Account-Id"] = cred.accountId;
  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = rec(await response.json());
  const rateLimit = rec(body.rate_limit);
  const primary = usageWindow(rateLimit.primary_window);
  const secondary = usageWindow(rateLimit.secondary_window);
  if (!primary && !secondary) throw new Error("没有窗口数据");
  return {
    plan: typeof body.plan_type === "string" ? body.plan_type : undefined,
    account: typeof body.email === "string" ? body.email : undefined,
    serviceable:
      typeof rateLimit.limit_reached === "boolean"
        ? !rateLimit.limit_reached
        : undefined,
    primary,
    secondary,
  };
}

async function fetchGrok(cred: Record<string, unknown>): Promise<UsageRow> {
  const access = typeof cred.access === "string" ? cred.access : undefined;
  if (!access) throw new Error("不是 OAuth，无法拉额度");
  const headers = {
    Authorization: `Bearer ${access}`,
    "X-XAI-Token-Auth": "xai-grok-cli",
    Accept: "application/json",
  };
  const [billingResponse, userResponse] = await Promise.all([
    fetch("https://cli-chat-proxy.grok.com/v1/billing?format=credits", {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12_000),
    }),
    fetch("https://cli-chat-proxy.grok.com/v1/user", {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(12_000),
    }).catch(() => undefined),
  ]);
  if (!billingResponse.ok) throw new Error(`HTTP ${billingResponse.status}`);
  let account: string | undefined;
  try {
    if (userResponse?.ok) {
      const user = rec(await userResponse.json());
      if (typeof user.email === "string") account = user.email;
    }
  } catch {
    // ignore
  }
  const config = rec(rec(await billingResponse.json()).config);
  const period = rec(config.currentPeriod);
  const resetAt = epochMs(period.end) ?? epochMs(config.billingPeriodEnd);
  const products = Array.isArray(config.productUsage) ? config.productUsage : [];
  const grokBuild = products
    .map((entry) => rec(entry))
    .find((entry) => typeof entry.product === "string" && /grokbuild/i.test(entry.product));
  const usedPercent = pct(grokBuild?.usagePercent) ?? pct(config.creditUsagePercent);
  if (usedPercent === undefined || resetAt === undefined) throw new Error("没有额度窗口");
  return {
    account,
    serviceable: usedPercent >= 100 ? false : undefined,
    primary: { usedPercent, resetAt },
  };
}

async function fetchGo(cred: Record<string, unknown>): Promise<UsageRow> {
  const key = typeof cred.key === "string" ? cred.key : undefined;
  if (!key) throw new Error("缺少 OpenCode Go API Key");
  const response = await fetch("https://opencode.ai/zen/go/v1/usage", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const usage = rec(rec(await response.json()).usage);
  const windows = (["rolling", "weekly", "monthly"] as const).map((name) => {
    const source = rec(usage[name]);
    const usedPercent = typeof source.percent === "number" ? pct(source.percent) : undefined;
    const resetAt = epochMs(source.resetsAt);
    if (usedPercent === undefined || resetAt === undefined) throw new Error("额度窗口数据无效");
    return { label: { rolling: "5小时", weekly: "本周", monthly: "本月" }[name], usedPercent, resetAt };
  });
  const limiting = windows.reduce((a, b) => b.usedPercent > a.usedPercent ? b : a);
  return { plan: "OpenCode Go", primary: limiting, windows, serviceable: windows.every((w) => w.usedPercent < 100) };
}

// Import only Go here: importing all auth slots could overwrite recovered Codex OAuth.
export async function syncGoAccount(): Promise<QuotaSnapshot> {
  const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Record<string, unknown>;
  const cred = rec(auth["opencode-go"]);
  if (typeof cred.key !== "string") return snapshot(readStore());
  let usage: UsageRow | undefined;
  let error: string | undefined;
  try { usage = await fetchGo(cred); } catch (e) { error = e instanceof Error && e.message.startsWith("HTTP") ? e.message : "刷新失败"; }
  const store = readStore();
  const existing = store.accounts.find((a) => a.id === "opencode-go");
  const account: StoredAccount = { id: "opencode-go", family: "go", label: existing?.label ?? "OpenCode Go", cred, usage: usage ?? existing?.usage, error };
  if (existing) Object.assign(existing, account); else store.accounts.push(account);
  const backup = `${STORE_PATH}.bak-go-${Date.now()}`;
  copyFileSync(STORE_PATH, backup);
  chmodSync(backup, 0o600);
  writeStore(store);
  return snapshot(store);
}

export async function handleAddGoKey(input: { key: string; label?: string }): Promise<QuotaSnapshot> {
  const key = input.key.trim();
  if (!key || /\s/.test(key)) throw new Error("GO_KEY_INVALID");
  const cred = { type: "api_key", key };
  let usage: UsageRow;
  try { usage = await fetchGo(cred); }
  catch (e) {
    const message = e instanceof Error ? e.message : "";
    throw new Error(message === "HTTP 401" ? "GO_KEY_INVALID" : message === "HTTP 403" ? "GO_SUBSCRIPTION_REQUIRED" : "GO_VERIFY_FAILED");
  }
  // Re-read after the network call so other account updates are not lost.
  const auth = (existsSync(AUTH_PATH) ? JSON.parse(readFileSync(AUTH_PATH, "utf8")) : {}) as Record<string, unknown>;
  const store = readStore();
  const matching = Object.entries(auth).find(([id, value]) => familyOfSlot(id) === "go" && rec(value).key === key);
  const id = matching?.[0] ?? nextSlotId("go", store, auth);
  const existing = store.accounts.find((a) => a.id === id);
  const stamp = Date.now();
  for (const path of [AUTH_PATH, STORE_PATH]) {
    if (!existsSync(path)) continue;
    const backup = `${path}.bak-add-go-${stamp}`;
    copyFileSync(path, backup);
    chmodSync(backup, 0o600);
  }
  if (!matching) { auth[id] = cred; writeJson(AUTH_PATH, auth); }
  const account: StoredAccount = {
    id, family: "go", label: input.label?.trim() || existing?.label || (id === "opencode-go" ? "OpenCode Go" : `OpenCode Go ${id.split("-").pop()}`),
    cred: matching ? rec(matching[1]) : cred, usage,
  };
  if (existing) Object.assign(existing, account, { error: undefined }); else store.accounts.push(account);
  writeStore(store);
  return snapshot(store, "OpenCode Go 已验证并保存");
}

function restartDaemon() {
  const child = spawn("paseo", ["daemon", "restart"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
}

export function handleGetQuota(): QuotaSnapshot {
  return snapshot(readStore());
}

export function handleImportAuth(): QuotaSnapshot {
  if (existsSync(STORE_PATH)) {
    const backup = `${STORE_PATH}.bak-import-${Date.now()}`;
    copyFileSync(STORE_PATH, backup);
    chmodSync(backup, 0o600);
  }
  const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Record<string, unknown>;
  const store = readStore();
  const byId = new Map(store.accounts.map((account) => [account.id, account]));
  for (const [id, value] of Object.entries(auth)) {
    const family = familyOfSlot(id);
    if (!family || !value || typeof value !== "object") continue;
    const cred = rec(value);
    const prev = byId.get(id);
    byId.set(id, {
      id,
      family,
      label: prev?.label?.includes("@") ? prev.label : id,
      cred,
      usage: prev?.usage,
      error: undefined,
    });
  }
  store.accounts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeStore(store);
  return snapshot(store, `已导入 ${store.accounts.length} 个账号到铁铁汁`);
}

let refreshInFlight: Promise<QuotaSnapshot> | null = null;
let lastRefreshAttempt = 0;

export async function handleRefreshQuota(input: { mode?: "manual" | "auto" } = {}): Promise<QuotaSnapshot> {
  if (refreshInFlight) return refreshInFlight;
  const store = readStore();
  if (store.accounts.length === 0) return snapshot(store);
  const cooldown = input.mode === "auto" ? 5 * 60_000 : 30_000;
  if (Date.now() - Math.max(lastRefreshAttempt, store.fetchedAt ?? 0) < cooldown) return snapshot(store);
  lastRefreshAttempt = Date.now();
  refreshInFlight = refreshAccounts(store);
  try { return await refreshInFlight; } finally { refreshInFlight = null; }
}

async function refreshAccounts(store: Store): Promise<QuotaSnapshot> {
  const originals = new Map(store.accounts.map((a) => [a.id, a.cred]));
  const fetchUsage = (account: StoredAccount) => account.family === "codex" ? fetchCodex(account.cred) : account.family === "go" ? fetchGo(account.cred) : fetchGrok(account.cred);
  await Promise.all(store.accounts.map(async (account) => {
    try {
      account.cred = await ensureCredential(account.family, account.cred);
      try { account.usage = await fetchUsage(account); }
      catch (e) {
        if (!(e instanceof Error) || e.message !== "HTTP 401" || account.cred.type !== "oauth") throw e;
        account.cred = await ensureCredential(account.family, account.cred, true);
        account.usage = await fetchUsage(account);
      }
      if (account.usage.account?.includes("@")) account.label = account.usage.account;
      account.error = undefined;
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      account.error = message === "AUTH_RELOGIN" || message === "HTTP 401" ? "登录已失效，请重新授权"
        : message === "AUTH_REFRESH_FAILED" ? "凭据续期失败，请稍后重试"
        : message.startsWith("HTTP") ? message : "刷新失败";
    }
  }));
  // Merge into the current store; do not overwrite login/import/switch actions made while fetching.
  const current = readStore();
  const backup = `${STORE_PATH}.bak-quota-${Date.now()}`;
  if (store.accounts.some((a) => !sameCredential(a.cred, originals.get(a.id)!))) {
    copyFileSync(STORE_PATH, backup); chmodSync(backup, 0o600);
  }
  for (const result of store.accounts) {
    const account = current.accounts.find((a) => a.id === result.id);
    if (!account || !sameCredential(account.cred, originals.get(result.id)!)) continue;
    account.cred = result.cred; account.usage = result.usage; account.error = result.error;
    if (result.label.includes("@")) account.label = result.label;
  }
  current.fetchedAt = Date.now();
  writeStore(current);
  return snapshot(current);
}

function openBrowser(url: string) {
  spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
}

function nextSlotId(family: Family, store: Store, auth: Record<string, unknown>): string {
  const live = LIVE_KEY[family];
  const prefix = family === "codex" ? "openai-codex-account-" : family === "go" ? "opencode-go-account-" : "xai-account-";
  const taken = new Set([...Object.keys(auth), ...store.accounts.map((a) => a.id)]);
  if (!taken.has(live)) return live;
  let n = 2;
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

function hangingPrompt(signal?: AbortSignal): Promise<string> {
  return new Promise((_, reject) => {
    const fail = () => reject(new Error("Login cancelled"));
    if (signal?.aborted) fail();
    signal?.addEventListener("abort", fail, { once: true });
  });
}

async function runOAuth(family: Family): Promise<Record<string, unknown>> {
  if (family === "go") throw new Error("OpenCode Go 使用 API Key，请导入 auth.json");
  const signal = AbortSignal.timeout(5 * 60 * 1000);
  const interaction = {
    signal,
    async prompt(prompt: { type: string; options?: Array<{ id: string }>; signal?: AbortSignal }) {
      if (prompt.type === "select") throw new Error("请使用面板的设备码授权入口");
      if (prompt.type === "manual_code") return hangingPrompt(prompt.signal ? AbortSignal.any([signal, prompt.signal]) : signal);
      throw new Error(`不支持的登录步骤: ${prompt.type}`);
    },
    notify(event: { type: string; url?: string; verificationUri?: string }) {
      if (event.type === "auth_url" && event.url) openBrowser(event.url);
      if (event.type === "device_code" && event.verificationUri) openBrowser(event.verificationUri);
    },
  };
  const oauth = await loadOAuth(family);
  return oauth.login(interaction);
}

let loginInProgress = false;

export async function handleLogin(input: { family: Family }): Promise<QuotaSnapshot> {
  if (loginInProgress) throw new Error("登录进行中，请先完成主机浏览器授权");
  loginInProgress = true;
  try {
    return await loginAndSave(input);
  } finally {
    loginInProgress = false;
  }
}

async function loginAndSave(input: { family: Family }): Promise<QuotaSnapshot> {
  let cred: Record<string, unknown>;
  try {
    cred = await runOAuth(input.family);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/cancel|abort|timeout|Missing authorization code/i.test(message)) throw new Error("登录超时或取消，请重新打开主机浏览器授权");
    if (/EADDRINUSE|address already in use/i.test(message)) throw new Error("登录回调端口被占用，请关闭其他登录流程后重试");
    if (/PACKAGE|MODULE|resolve|OAuth 实现/i.test(message)) throw new Error("登录模块加载失败，请检查插件依赖");
    throw new Error("登录授权失败，请在运行 Paseo 的 Mac 浏览器完成授权后重试");
  }
  return saveLoginCredentials(input.family, cred);
}

export function saveLoginCredentials(family: Family, cred: Record<string, unknown>): QuotaSnapshot {
  const store = readStore();
  const auth = (existsSync(AUTH_PATH) ? JSON.parse(readFileSync(AUTH_PATH, "utf8")) : {}) as Record<string, unknown>;
  const id = nextSlotId(family, store, auth);
  if (existsSync(AUTH_PATH)) {
    const backup = `${AUTH_PATH}.bak-login-${Date.now()}`;
    copyFileSync(AUTH_PATH, backup);
    chmodSync(backup, 0o600);
  }
  auth[id] = cred;
  writeJson(AUTH_PATH, auth);
  store.accounts = store.accounts.filter((account) => account.id !== id);
  store.accounts.push({
    id,
    family,
    label: id,
    cred,
  });
  store.accounts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeStore(store);
  return snapshot(store, `已登录并保存 ${id}，点刷新看额度，选用后才会重启`);
}

export function handleSwitchAccount(input: { id: string }): QuotaSnapshot {
  const store = readStore();
  const account = store.accounts.find((item) => item.id === input.id);
  if (!account) throw new Error("先导入这个账号");
  const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Record<string, unknown>;
  copyFileSync(AUTH_PATH, `${AUTH_PATH}.bak-ttz`);
  chmodSync(`${AUTH_PATH}.bak-ttz`, 0o600);
  auth[LIVE_KEY[account.family]] = account.cred;
  writeJson(AUTH_PATH, auth);
  store.preferred[account.family] = account.id;
  writeStore(store);
  restartDaemon();
  return snapshot(store, `已把 ${account.label} 写入 Pi，正在重启 daemon（当前对话会断开）`);
}
