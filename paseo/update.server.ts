import { VERSION } from "./version";

type ReleaseInfo = { current: string; latest: string; available: boolean };
let cached: { at: number; value: ReleaseInfo } | undefined;
let checking: Promise<ReleaseInfo> | undefined;

export function newerVersion(latest: string, current: string): boolean {
  const a = latest.replace(/^v/, "").split(".").map(Number);
  const b = current.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}

export async function handleCheckUpdates(): Promise<ReleaseInfo> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.value;
  if (checking) return checking;
  checking = (async () => {
    const response = await fetch("https://api.github.com/repos/tietiezhi-1216/ttz/releases/latest", {
      headers: { Accept: "application/vnd.github+json", "User-Agent": `ttz/${VERSION}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("暂时无法检查更新，请查看 GitHub Releases");
    const body = await response.json() as { tag_name?: unknown };
    if (typeof body.tag_name !== "string" || !/^v?\d+\.\d+\.\d+$/.test(body.tag_name)) throw new Error("版本信息无效");
    const latest = body.tag_name.replace(/^v/, "");
    const value = { current: VERSION, latest, available: newerVersion(latest, VERSION) };
    cached = { at: Date.now(), value };
    return value;
  })();
  try { return await checking; } finally { checking = undefined; }
}
