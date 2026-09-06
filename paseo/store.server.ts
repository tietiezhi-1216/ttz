import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import type { AccountQuota, Family, Prefs, QuotaSnapshot } from "./shared";

const STORE_PATH = join(homedir(), ".paseo", "ttz.json");
const AUTH_PATH = join(homedir(), ".pi/agent/auth.json");

const DEFAULT_NAMES: Record<string, string> = {
  "openai-codex": "qq",
  "openai-codex-account-2": "hotmail",
  "openai-codex-account-3": "bess",
  xai: "1216",
  "xai-account-2": "2020",
};

type UsageRow = {
  family?: string;
  account?: string;
  plan?: string;
  serviceable?: boolean;
  fetchedAt?: number;
  primary?: { usedPercent?: number; resetAt?: number };
  secondary?: { usedPercent?: number; resetAt?: number };
};

type Store = {
  preferredId: string | null;
  showCodex: boolean;
  showGrok: boolean;
  names: Record<string, string>;
  usage: Record<string, UsageRow>;
  fetchedAt: number | null;
};

function emptyStore(): Store {
  return {
    preferredId: null,
    showCodex: true,
    showGrok: true,
    names: { ...DEFAULT_NAMES },
    usage: {},
    fetchedAt: null,
  };
}

function readStore(): Store {
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Partial<Store>;
    return {
      ...emptyStore(),
      ...raw,
      names: { ...DEFAULT_NAMES, ...(raw.names ?? {}) },
      usage: raw.usage ?? {},
      showCodex: raw.showCodex !== false,
      showGrok: raw.showGrok !== false,
      preferredId: raw.preferredId ?? null,
      fetchedAt: raw.fetchedAt ?? null,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(next: Store) {
  writeFileSync(STORE_PATH, JSON.stringify(next, null, 2));
}

function familyOfSlot(id: string): Family | null {
  if (id === "openai-codex" || id.startsWith("openai-codex-account-")) return "codex";
  if (id === "xai" || id.startsWith("xai-account-")) return "xai";
  return null;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
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

function usageWindow(value: unknown, fallbackWindowSeconds?: number) {
  const source = rec(value);
  const usedPercent = pct(source.used_percent ?? source.utilization);
  const resetAt = epochMs(source.reset_at ?? source.resets_at);
  if (usedPercent === undefined || resetAt === undefined) return undefined;
  return {
    usedPercent,
    resetAt,
    ...(fallbackWindowSeconds !== undefined ? { windowSeconds: fallbackWindowSeconds } : {}),
  };
}

type AuthSlot = { id: string; family: Family; access?: string; accountId?: string };

function loadAuthSlots(): AuthSlot[] {
  try {
    const auth = JSON.parse(readFileSync(AUTH_PATH, "utf8")) as Record<string, unknown>;
    const slots: AuthSlot[] = [];
    for (const [id, value] of Object.entries(auth)) {
      const family = familyOfSlot(id);
      if (!family || !value || typeof value !== "object") continue;
      const row = value as { access?: string; accountId?: string };
      slots.push({
        id,
        family,
        access: typeof row.access === "string" ? row.access : undefined,
        accountId: typeof row.accountId === "string" ? row.accountId : undefined,
      });
    }
    return slots;
  } catch {
    return [];
  }
}

async function fetchCodex(slot: AuthSlot): Promise<UsageRow> {
  if (!slot.access) throw new Error("没有 token");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${slot.access}`,
    Accept: "application/json",
  };
  if (slot.accountId) headers["ChatGPT-Account-Id"] = slot.accountId;
  const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = rec(await response.json());
  const rateLimit = rec(body.rate_limit);
  const primary = usageWindow(rateLimit.primary_window, 5 * 60 * 60);
  const secondary = usageWindow(rateLimit.secondary_window, 7 * 24 * 60 * 60);
  if (!primary && !secondary) throw new Error("没有窗口数据");
  return {
    family: "codex",
    fetchedAt: Date.now(),
    plan: typeof body.plan_type === "string" ? body.plan_type : undefined,
    account: typeof body.email === "string" ? body.email : undefined,
    serviceable:
      typeof rateLimit.limit_reached === "boolean"
        ? !rateLimit.limit_reached
        : typeof rateLimit.allowed === "boolean"
          ? rateLimit.allowed
          : undefined,
    primary,
    secondary,
  };
}

async function fetchGrok(slot: AuthSlot): Promise<UsageRow> {
  if (!slot.access) throw new Error("没有 token");
  const headers = {
    Authorization: `Bearer ${slot.access}`,
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
    family: "xai",
    fetchedAt: Date.now(),
    account,
    serviceable: usedPercent >= 100 ? false : undefined,
    primary: { usedPercent, resetAt },
  };
}

function snapshotFromStore(store: Store, errors: Record<string, string> = {}): QuotaSnapshot {
  const accounts: AccountQuota[] = [];
  const ids = new Set([...Object.keys(store.usage), ...loadAuthSlots().map((s) => s.id)]);
  for (const id of ids) {
    const family = familyOfSlot(id);
    if (!family) continue;
    const row = store.usage[id] ?? {};
    const window = row.secondary ?? row.primary;
    const used = window?.usedPercent;
    if (typeof used !== "number") continue;
    accounts.push({
      id,
      family,
      label: store.names[id] ?? DEFAULT_NAMES[id] ?? id,
      plan: row.plan ?? null,
      usedPercent: Math.round(used),
      resetAt: typeof window?.resetAt === "number" ? window.resetAt : null,
      serviceable: typeof row.serviceable === "boolean" ? row.serviceable : null,
      error: errors[id] ?? null,
    });
  }
  accounts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
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
  };
}

export function handleGetQuota(): QuotaSnapshot {
  return snapshotFromStore(readStore());
}

export function handleGetPrefs(): Prefs {
  const store = readStore();
  return { showCodex: store.showCodex, showGrok: store.showGrok };
}

export function handleSetPrefs(patch: Partial<Prefs>): Prefs {
  const store = readStore();
  if (typeof patch.showCodex === "boolean") store.showCodex = patch.showCodex;
  if (typeof patch.showGrok === "boolean") store.showGrok = patch.showGrok;
  writeStore(store);
  return { showCodex: store.showCodex, showGrok: store.showGrok };
}

export function handleSwitchAccount(input: { id: string }): QuotaSnapshot {
  if (!familyOfSlot(input.id)) throw new Error("unknown account");
  const store = readStore();
  store.preferredId = input.id;
  writeStore(store);
  return snapshotFromStore(store);
}

export async function handleRefreshQuota(): Promise<QuotaSnapshot> {
  const store = readStore();
  const errors: Record<string, string> = {};
  await Promise.all(
    loadAuthSlots().map(async (slot) => {
      try {
        store.usage[slot.id] = slot.family === "codex" ? await fetchCodex(slot) : await fetchGrok(slot);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors[slot.id] = message.startsWith("HTTP") ? message : "刷新失败";
      }
    }),
  );
  store.fetchedAt = Date.now();
  writeStore(store);
  return snapshotFromStore(store, errors);
}
