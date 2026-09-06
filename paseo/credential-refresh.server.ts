import { readFileSync, copyFileSync, chmodSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadOAuth } from "./auth-flow.server";
import type { Family } from "./shared";

type Credential = Record<string, unknown>;
const AUTH = join(homedir(), ".pi/agent/auth.json");
function claims(c: Credential): Record<string, unknown> {
  try { return JSON.parse(Buffer.from(String(c.access).split(".")[1], "base64url").toString()); } catch { return {}; }
}
// Claims only match locally held credentials. They are not used to authenticate requests.
export function credentialIdentity(family: Family, c: Credential): string | null {
  if (c.type !== "oauth") return null;
  const p = claims(c);
  if (typeof p.sub !== "string" || !p.sub) return null;
  return JSON.stringify([family, p.iss ?? "", p.sub, c.accountId ?? "", p.principal_id ?? "", p.team_id ?? ""]);
}
export function credentialExpiry(c: Credential): number {
  if (typeof c.expires === "number" && Number.isFinite(c.expires)) return c.expires < 1e10 ? c.expires * 1000 : c.expires;
  const exp = claims(c).exp;
  return typeof exp === "number" ? exp * 1000 : 0;
}
export function sameCredential(a: Credential, b: Credential): boolean {
  return a.type === b.type && a.access === b.access && a.refresh === b.refresh && a.key === b.key && a.accountId === b.accountId;
}
function readAuth(): Record<string, Credential> { return JSON.parse(readFileSync(AUTH, "utf8")); }
export function newestCredential(family: Family, old: Credential): Credential {
  const identity = credentialIdentity(family, old);
  if (!identity) return old;
  const prefix = family === "codex" ? "openai-codex" : "xai";
  let best = old;
  for (const [id, candidate] of Object.entries(readAuth())) {
    if (!candidate || typeof candidate !== "object" || !(id === prefix || id.startsWith(prefix + "-account-"))) continue;
    if (credentialIdentity(family, candidate) === identity && credentialExpiry(candidate) > credentialExpiry(best)) best = candidate;
  }
  return best;
}
const renewals = new Map<string, Promise<Credential>>();
export async function ensureCredential(family: Family, original: Credential, force = false): Promise<Credential> {
  if (family === "go" || original.type !== "oauth") return original;
  const current = newestCredential(family, original);
  const expiry = credentialExpiry(current);
  // A concurrent Pi refresh already replaced the failing token; try that token first.
  if (force && !sameCredential(current, original) && expiry > Date.now()) return current;
  if (!force && (!expiry || expiry > Date.now() + 60_000)) return current;
  if (typeof current.refresh !== "string" || !current.refresh) throw new Error("AUTH_RELOGIN");
  const lock = credentialIdentity(family, current) ?? `${family}:${current.refresh}`;
  const existing = renewals.get(lock);
  if (existing) return existing;
  const task = (async () => {
    let renewed: Credential;
    try {
      const oauth = await loadOAuth(family);
      if (!oauth.refresh) throw new Error("AUTH_RELOGIN");
      renewed = { ...current, ...await oauth.refresh(current, AbortSignal.timeout(15_000)), type: "oauth" };
    } catch (e) {
      const latest = newestCredential(family, current);
      if (!sameCredential(latest, current) && credentialExpiry(latest) > Date.now()) return latest;
      const message = e instanceof Error ? e.message : "";
      throw new Error(/invalid_grant|401|400|revoked|expired/i.test(message) ? "AUTH_RELOGIN" : "AUTH_REFRESH_FAILED");
    }
    if (typeof renewed.access !== "string" || !renewed.access) throw new Error("AUTH_REFRESH_FAILED");
    const previousIdentity = credentialIdentity(family, current);
    const nextIdentity = credentialIdentity(family, renewed);
    if (previousIdentity && nextIdentity && previousIdentity !== nextIdentity) throw new Error("AUTH_IDENTITY_CHANGED");
    // Re-read and only replace unchanged credentials, never a newly switched default.
    const auth = readAuth();
    let changed = false;
    for (const [id, candidate] of Object.entries(auth)) {
      if (candidate && sameCredential(candidate, current)) { auth[id] = renewed; changed = true; }
    }
    if (changed) {
      const backup = `${AUTH}.bak-quota-refresh-${Date.now()}`;
      copyFileSync(AUTH, backup); chmodSync(backup, 0o600);
      writeFileSync(AUTH, JSON.stringify(auth, null, 2), { mode: 0o600 }); chmodSync(AUTH, 0o600);
    }
    return renewed;
  })();
  renewals.set(lock, task);
  try { return await task; } finally { renewals.delete(lock); }
}
