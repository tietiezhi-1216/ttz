import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import type { LoginState } from "./auth.shared";

type Family = "codex" | "xai";
type Interaction = {
  signal: AbortSignal;
  prompt: (p: { type: string; options?: Array<{ id: string }>; signal?: AbortSignal }) => Promise<string>;
  notify: (event: { type: string; url?: string; verificationUri?: string; userCode?: string }) => void;
};
type OAuth = {
  login: (interaction: Interaction) => Promise<Record<string, unknown>>;
  refresh?: (credential: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>;
};

export async function loadOAuth(family: Family): Promise<OAuth> {
  // Paseo bundles the entry into a cache directory. Resolve dependencies from the
  // registered installation, not import.meta.url of that generated bundle.
  const config = JSON.parse(readFileSync(join(homedir(), ".paseo/config.json"), "utf8"));
  const directory = config.plugins?.ttz?.path;
  if (typeof directory !== "string") throw new Error("OAUTH_MODULE");
  const file = join(directory, "node_modules/@earendil-works/pi-ai/dist/auth/oauth", family === "codex" ? "openai-codex.js" : "xai.js");
  if (!existsSync(file)) throw new Error("OAUTH_MODULE");
  try {
    const mod = await import(pathToFileURL(file).href);
    const oauth = family === "codex" ? mod.openaiCodexOAuth : mod.xaiOAuth;
    if (typeof oauth?.login !== "function") throw new Error("OAUTH_MODULE");
    return oauth;
  } catch { throw new Error("OAUTH_MODULE"); }
}

type Session = { state: LoginState; controller: AbortController; timer: ReturnType<typeof setTimeout>; resolve?: (code: string) => void };
let session: Session | undefined;
const running = (s: Session) => ["starting", "waiting", "saving"].includes(s.state.status);
const snapshot = (s: Session): LoginState => ({ ...s.state });
function requireSession(id: string) {
  if (!session || session.state.id !== id) throw new Error("登录会话已失效，请重新开始");
  return session;
}
function clearSecrets(s: Session) { s.state.url = null; s.state.userCode = null; s.state.acceptsCode = false; s.resolve = undefined; }

export function beginLogin(family: Family, save: (family: Family, cred: Record<string, unknown>) => void): LoginState {
  if (session && running(session)) {
    if (session.state.family === family) return snapshot(session);
    throw new Error("另一个平台正在登录，请先取消");
  }
  const controller = new AbortController();
  const s: Session = {
    state: { id: randomUUID(), family, status: "starting", url: null, userCode: null, acceptsCode: false, error: null },
    controller,
    timer: setTimeout(() => controller.abort(), 5 * 60_000),
  };
  session = s;
  void (async () => {
    try {
      const oauth = await loadOAuth(family);
      const cred = await oauth.login({
        signal: controller.signal,
        async prompt(p) {
          if (p.type === "select") {
            const device = p.options?.find((option) => option.id === "device_code");
            if (!device) throw new Error("DEVICE_CODE_UNAVAILABLE");
            return device.id;
          }
          if (p.type !== "manual_code") throw new Error("UNSUPPORTED_PROMPT");
          return new Promise<string>((resolve, reject) => {
            const signal = p.signal ? AbortSignal.any([controller.signal, p.signal]) : controller.signal;
            const cancel = () => { s.resolve = undefined; s.state.acceptsCode = false; reject(new Error("CANCELLED")); };
            if (signal.aborted) { cancel(); return; }
            signal.addEventListener("abort", cancel, { once: true });
            s.state.acceptsCode = true;
            s.resolve = (code) => { signal.removeEventListener("abort", cancel); s.resolve = undefined; s.state.acceptsCode = false; resolve(code); };
          });
        },
        notify(event) {
          const url = event.url ?? event.verificationUri;
          if (!url || !["auth_url", "device_code"].includes(event.type)) return;
          const parsed = new URL(url);
          if (parsed.protocol !== "https:") throw new Error("INVALID_AUTH_URL");
          s.state.url = url;
          s.state.userCode = event.userCode ?? null;
          s.state.status = "waiting";
        },
      });
      if (controller.signal.aborted) throw new Error("CANCELLED");
      s.state.status = "saving";
      save(family, cred);
      s.state.status = "done";
    } catch (e) {
      if (s.state.status !== "cancelled") {
        s.state.status = "error";
        const message = e instanceof Error ? e.message : "";
        s.state.error = controller.signal.aborted ? "授权已超时，请重新开始" : message === "OAUTH_MODULE" ? "登录模块加载失败" : /EADDRINUSE/.test(message) ? "回调端口被占用，请关闭其他登录流程" : "授权失败，请重新获取链接并授权";
      }
    } finally { clearTimeout(s.timer); clearSecrets(s); }
  })();
  return snapshot(s);
}
export function getLogin(id: string) { return snapshot(requireSession(id)); }
export function submitCode(id: string, code: string) {
  const s = requireSession(id);
  if (!s.resolve || s.state.status !== "waiting") throw new Error("当前无需提交回调地址");
  s.state.status = "saving";
  s.resolve(code.trim());
  return snapshot(s);
}
export function cancel(id: string) {
  const s = requireSession(id);
  if (running(s)) { s.state.status = "cancelled"; s.controller.abort(); clearSecrets(s); clearTimeout(s.timer); }
  return snapshot(s);
}
export function disposeLogin() { if (session) cancel(session.state.id); }
