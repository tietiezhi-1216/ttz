import { spawn } from "node:child_process";
import { chmodSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AccountQuota, Family, QuotaSnapshot } from "./shared";

const STORE_PATH = join(homedir(), ".paseo", "ttz.json");
const AUTH_PATH = join(homedir(), ".pi/agent/auth.json");

const DEFAULT_NAMES: Record<string, string> = {
  "openai-codex": "qq",
  "openai-codex-account-2": "hotmail",
  "openai-codex-account-3": "bess",
  xai: "1216",
  "xai-account-2": "2020",
};

const LIVE_KEY: Record<Family, string> = {
  codex: "openai-codex",
  xai: "xai",
};

type UsageRow = {
  account?: string;
  plan?: string;
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
  preferredId: string | null;
  accounts: StoredAccount[];
  fetchedAt: number | null;
};

function familyOfSlot(id: string): Family | null {
  if (id === "openai-codex" || id.startsWith("openai-codex-account-")) return "codex";
  if (id === "xai" || id.startsWith("xai-account-")) return "xai";
  return null;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, JSON.stringify(value, null, 2));
  chmodSync(path, 0o600);
}

function readStore(): Store {
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<Store>;
    return {
      preferredId: raw.preferredId ?? null,
      accounts: Array.isArray(raw.accounts) ? raw.accounts : [],
      fetchedAt: raw.fetchedAt ?? null,
    };
  } catch {
    return { preferredId: null, accounts: [], fetchedAt: null };
  }
}

function writeStore(store: Store) {
  writeJson(STORE_PATH, store);
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
      usedPercent: typeof used === "number" ? Math.round(used) : null,
      resetAt: typeof window?.resetAt === "number" ? window.resetAt : null,
      serviceable: typeof account.usage?.serviceable === "boolean" ? account.usage.serviceable : null,
      error: account.error ?? null,
      authType: typeof account.cred.type === "string" ? account.cred.type : null,
    };
  });
  const familySummary = (family: Family) => {
    const rows = accounts.filter((a) => a.family === family);
    const percents = rows.map((a) => a.usedPercent).filter((n): n is number => n !== null);
    return {
      usedPercent: percents.length ? Math.min(...percents) : null,
      accountCount: rows.length,
    };
  };
  return {
    families: { codex: familySummary("codex"), xai: familySummary("xai") },
    accounts,
    preferredId: store.preferredId,
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
      label: prev?.label ?? DEFAULT_NAMES[id] ?? id,
      cred,
      usage: prev?.usage,
      error: undefined,
    });
  }
  store.accounts = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeStore(store);
  return snapshot(store, `已导入 ${store.accounts.length} 个账号到铁铁汁`);
}

export async function handleRefreshQuota(): Promise<QuotaSnapshot> {
  const store = readStore();
  if (store.accounts.length === 0) return snapshot(store, "先点导入 auth.json");
  await Promise.all(
    store.accounts.map(async (account) => {
      try {
        account.usage =
          account.family === "codex" ? await fetchCodex(account.cred) : await fetchGrok(account.cred);
        if (account.usage.account) {
          account.label = DEFAULT_NAMES[account.id] ?? account.usage.account.split("@")[0] ?? account.label;
        }
        account.error = undefined;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        account.error = message.startsWith("HTTP") ? message : "刷新失败";
      }
    }),
  );
  store.fetchedAt = Date.now();
  writeStore(store);
  return snapshot(store);
}

function openBrowser(url: string) {
  spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
}

function nextSlotId(family: Family, store: Store, auth: Record<string, unknown>): string {
  const live = LIVE_KEY[family];
  const prefix = family === "codex" ? "openai-codex-account-" : "xai-account-";
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
  const signal = AbortSignal.timeout(5 * 60 * 1000);
  const interaction = {
    signal,
    async prompt(prompt: { type: string; options?: Array<{ id: string }> }) {
      if (prompt.type === "select") return prompt.options?.[0]?.id ?? "";
      if (prompt.type === "manual_code") return hangingPrompt(signal);
      throw new Error(`不支持的登录步骤: ${prompt.type}`);
    },
    notify(event: { type: string; url?: string; verificationUri?: string }) {
      if (event.type === "auth_url" && event.url) openBrowser(event.url);
      if (event.type === "device_code" && event.verificationUri) openBrowser(event.verificationUri);
    },
  };
  const piAiRoot = dirname(createRequire(import.meta.url).resolve("@earendil-works/pi-ai/package.json"));
  const file = family === "codex" ? "openai-codex.js" : "xai.js";
  const mod = (await import(
    pathToFileURL(join(piAiRoot, "dist/auth/oauth", file)).href
  )) as {
    openaiCodexOAuth?: { login: (i: unknown) => Promise<Record<string, unknown>> };
    xaiOAuth?: { login: (i: unknown) => Promise<Record<string, unknown>> };
  };
  const oauth = family === "codex" ? mod.openaiCodexOAuth : mod.xaiOAuth;
  if (!oauth) throw new Error("找不到 OAuth 实现");
  return oauth.login(interaction);
}

export async function handleLogin(input: { family: Family }): Promise<QuotaSnapshot> {
  const cred = await runOAuth(input.family);
  const store = readStore();
  const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Record<string, unknown>;
  const id = nextSlotId(input.family, store, auth);
  copyFileSync(AUTH_PATH, `${AUTH_PATH}.bak-ttz`);
  chmodSync(`${AUTH_PATH}.bak-ttz`, 0o600);
  auth[id] = cred;
  writeJson(AUTH_PATH, auth);
  store.accounts = store.accounts.filter((account) => account.id !== id);
  store.accounts.push({
    id,
    family: input.family,
    label: DEFAULT_NAMES[id] ?? id,
    cred,
  });
  store.accounts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  writeStore(store);
  return snapshot(store, `已登录并保存 ${DEFAULT_NAMES[id] ?? id}，点刷新看额度，选用后才会重启`);
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
  store.preferredId = account.id;
  writeStore(store);
  restartDaemon();
  return snapshot(store, `已把 ${account.label} 写入 Pi，正在重启 daemon（当前对话会断开）`);
}
