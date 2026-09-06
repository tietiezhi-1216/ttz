import type {
  PluginClientContext,
  PluginComposerPillProps,
  PluginSurfaceProps,
} from "@getpaseo/plugin";
import { useAgent, useRpc } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import {
  getQuota,
  importAuth,
  refreshQuota,
  switchAccount,
  type Family,
  type AccountQuota,
} from "./shared";
import { LoginPanel } from "./login.client";
import { GoKeyPanel } from "./go-key.client";
import { PillPanelController } from "./pill-panel.client";
import { UpdatePanel } from "./update.client";
import { VERSION } from "./version";

function formatWhen(ts: number | null, empty: string) {
  if (!ts) return empty;
  const at = new Date(ts);
  const clock = `${at.getMonth() + 1}/${at.getDate()} ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const ms = ts - Date.now();
  if (ms <= 0) return `已到 ${clock}`;
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins}分钟后 · ${clock}`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}小时后 · ${clock}`;
  return `${Math.round(hours / 24)}天后 · ${clock}`;
}

function usedPercent(used: number | null): number | null {
  return used === null || !Number.isFinite(used) ? null : Math.max(0, Math.min(100, used));
}

function usedLabel(used: number | null) {
  const percent = usedPercent(used);
  return percent === null ? "—" : `${Math.round(percent)}%`;
}

function RemainingBar({ used, theme, width = 48 }: {
  used: number | null;
  theme: PluginComposerPillProps["theme"];
  width?: number;
}) {
  const percent = usedPercent(used);
  const color = percent !== null && percent >= 95 ? "#df8580"
    : percent !== null && percent >= 80 ? "#d99868"
    : percent !== null && percent >= 50 ? "#d3aa64" : "#6bb7a4";
  // Native primitives keep the ring compatible with mobile plugin hosts (no SVG dependency).
  const size = width === 32 ? 12 : 20;
  const stroke = size === 12 ? 1.6 : 2.2;
  const radius = (size - stroke) / 2;
  return <View accessibilityLabel={`已用额度 ${percent === null ? "未知" : `${percent}%`}`} style={{ width: size, height: size }}>
    {Array.from({ length: 64 }, (_, i) => {
      const angle = (i / 64) * Math.PI * 2 - Math.PI / 2;
      const filled = percent !== null && i < Math.round(percent / 100 * 64);
      return <View key={i} style={{ position: "absolute", width: stroke, height: stroke, borderRadius: stroke / 2,
        left: size / 2 + Math.cos(angle) * radius - stroke / 2,
        top: size / 2 + Math.sin(angle) * radius - stroke / 2,
        backgroundColor: filled ? color : theme.colors.foregroundMuted,
        opacity: filled ? 1 : percent === null ? (Math.floor(i / 8) % 2 ? 0 : 0.4) : 0.16,
      }} />;
    })}
  </View>;
}

type Platform = Family | "unknown";
const platformNames: Record<Platform, string> = { codex: "Codex", xai: "Grok", go: "OpenCode Go", unknown: "当前模型" };

function modelPlatform(provider: string | undefined, model: string | null | undefined): { platform: Platform; slot: string | null } {
  const route = model?.includes("/") ? model.split("/")[0] : provider;
  if (route === "opencode-go" || route?.startsWith("opencode-go-account-")) return { platform: "go", slot: route === "opencode-go" ? null : route ?? null };
  if (route && /^(openai-codex|xai)(-account-[^/]+)?$/.test(route)) {
    return { platform: route.startsWith("xai") ? "xai" : "codex", slot: route.includes("-account-") ? route : null };
  }
  if (provider === "codex") return { platform: "codex", slot: null };
  return { platform: "unknown", slot: null };
}

function useQuota() {
  const rpc = useRpc(getQuota);
  return useQuery({
    queryKey: ["ttz-quota"],
    queryFn: () => rpc({}),
    refetchInterval: 60_000,
    staleTime: 60_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

function useAutoQuotaRefresh(active: boolean) {
  const refresh = useRpc(refreshQuota);
  const qc = useQueryClient();
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const update = () => {
      if (stopped || (AppState.currentState && AppState.currentState !== "active")) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh({ mode: "auto" }).then((data) => { if (!stopped) qc.setQueryData(["ttz-quota"], data); }).catch(() => {});
    };
    update();
    const timer = setInterval(update, 5 * 60_000);
    const subscription = AppState.addEventListener("change", update);
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", update);
    return () => {
      stopped = true; clearInterval(timer); subscription.remove();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", update);
    };
  }, [active, refresh, qc]);
}

function AccountCard({ family, rows, live, theme, pending, onSelect }: {
  family: Family;
  rows: AccountQuota[];
  live: AccountQuota | undefined;
  theme: PluginComposerPillProps["theme"];
  pending: boolean;
  onSelect: (id: string) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const chosen = rows.find((a) => a.id === choice);
  return (
    <View style={{ gap: 4 }}>
        <View>
          {rows.map((account) => (
            <View key={account.id} style={{ backgroundColor: account.id === live?.id ? "rgba(0, 0, 0, 0.18)" : "transparent", borderRadius: 6, paddingHorizontal: 8, marginVertical: 2 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: account.id === live?.id, disabled: pending || account.id === live?.id }} disabled={pending || account.id === live?.id} onPress={() => setChoice(account.id)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, opacity: pending ? 0.5 : 1 }}>
              <Text numberOfLines={1} ellipsizeMode="middle" style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: account.id === live?.id ? "600" : "400", flex: 1 }}>{account.label}</Text>
              <RemainingBar used={account.usedPercent} theme={theme} />
              <Text numberOfLines={1} accessibilityLabel={`已用额度 ${usedLabel(account.usedPercent)}`} style={{ color: theme.colors.foreground, fontSize: 11, width: 42, flexShrink: 0, textAlign: "right", fontVariant: ["tabular-nums"] }}>{usedLabel(account.usedPercent)}</Text>
            </Pressable>
            <View style={{ paddingBottom: 10, gap: 3 }}>
              {account.error ? (
                <Text accessibilityLabel={account.error} style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>⚠ {account.error.includes("授权") ? "请重新授权" : account.error.includes("续期") ? "续期失败，稍后重试" : "更新失败"}</Text>
              ) : account.family === "go" && account.windows.length ? (
                <View style={{ gap: 8 }}>
                  {account.windows.map((window) => (
                    <View key={window.label} style={{ gap: 3 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: 11 }}>{window.label}</Text>
                        <RemainingBar used={window.usedPercent} theme={theme} width={32} />
                        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 11, width: 42, textAlign: "right" }}>{usedLabel(window.usedPercent)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>↻ {formatWhen(window.resetAt, "—").split(" · ")[0]}</Text>
                        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>{new Date(window.resetAt).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View accessibilityLabel={`额度下次重置 ${formatWhen(account.resetAt, "未知")}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 1 }}>↻ {formatWhen(account.resetAt, "—").split(" · ")[0]}</Text>
                  <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11, flexShrink: 0, textAlign: "right" }}>{account.resetAt ? new Date(account.resetAt).toLocaleString(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : ""}</Text>
                </View>
              )}
            </View>
            </View>
          ))}
          {chosen ? <View style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingVertical: 10, gap: 8 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>切换到 {chosen.label}？</Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>将重启此主机的 Paseo 服务，运行中的对话会短暂断开。</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Btn label="取消" onPress={() => setChoice(null)} theme={theme} />
              <Btn label="确认切换" pending={pending} onPress={() => { onSelect(chosen.id); setChoice(null); }} theme={theme} accent />
            </View>
          </View> : null}
          {rows.length === 0 ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingVertical: 12 }}>暂无账号</Text> : null}
        </View>
    </View>
  );
}

const pillPanels = new Map<string, PillPanelController>();

function CombinedPill({ theme, agentId }: PluginComposerPillProps) {
  const { height } = useWindowDimensions();
  const model = useAgent(agentId, (agent) => ({ provider: agent.provider, model: agent.model }));
  const route = modelPlatform(model?.provider, model?.model);
  const [browsed, setBrowsed] = useState<Platform | null>(null);
  const [platformMenu, setPlatformMenu] = useState(false);
  const platform = browsed ?? route.platform;
  useEffect(() => { setBrowsed(null); setPlatformMenu(false); }, [model?.provider, model?.model]);
  const quota = useQuota();
  const [open, setOpen] = useState(false);
  useAutoQuotaRefresh(open);
  const qc = useQueryClient();
  const switching = useRpc(switchAccount);
  const switchMut = useMutation({
    mutationFn: (id: string) => switching({ id }),
    onSuccess: (data) => qc.setQueryData(["ttz-quota"], data),
  });
  useEffect(() => {
    const panel = pillPanels.get(agentId) ?? new PillPanelController();
    pillPanels.set(agentId, panel);
    const unregister = panel.register((visible) => {
      if (visible) { setBrowsed(null); setPlatformMenu(false); }
      setOpen(visible);
    });
    return () => {
      unregister();
      if (!panel.size) pillPanels.delete(agentId);
    };
  }, [agentId]);
  const closePanel = (event?: { stopPropagation: () => void }) => {
    event?.stopPropagation();
    pillPanels.get(agentId)?.close();
    setOpen(false);
  };
  const accounts = quota.data?.accounts ?? [];
  const liveCodex = accounts.find((a) => a.id === quota.data?.preferred.codex);
  const liveGrok = accounts.find((a) => a.id === quota.data?.preferred.xai);
  const liveGo = accounts.find((a) => a.id === quota.data?.preferred.go);
  // Explicit account routes take priority; base providers show their configured default.
  const sessionAccount = route.slot
    ? accounts.find((a) => a.id === route.slot)
    : route.platform === "codex" ? liveCodex : route.platform === "xai" ? liveGrok : route.platform === "go" ? liveGo : undefined;
  const percent = sessionAccount && !sessionAccount.error ? sessionAccount.usedPercent : null;
  return (
    <>
      <View style={{ flexDirection: "row", flexWrap: "nowrap", gap: 6, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 12, height: 12 }}>
          <RemainingBar used={percent} theme={theme} width={32} />
        </View>
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 11, flexShrink: 0, fontVariant: ["tabular-nums"] }}>{usedLabel(percent)}</Text>
      </View>
      <Modal transparent animationType="fade" visible={open} onRequestClose={() => closePanel()}>
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            padding: 16,
          }}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="关闭账号面板" onPress={closePanel} style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "#00000066" }} />
          <View
            style={{
              backgroundColor: theme.colors.surface0,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              gap: 8,
              maxHeight: height * 0.82,
              width: "100%",
              maxWidth: 440,
              alignSelf: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Pressable accessibilityRole="button" accessibilityLabel="切换平台" onPress={() => setPlatformMenu(!platformMenu)}>
                <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "600" }}>{platformNames[platform]} ▾</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={10} onPress={closePanel}><Text style={{ color: theme.colors.foregroundMuted, fontSize: 18 }}>×</Text></Pressable>
            </View>
            <ScrollView style={{ maxHeight: height * 0.82 - 76, flexShrink: 1 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
              {platformMenu ? (["codex", "xai", "go"] as const).map((item) => (
                <Pressable key={item} accessibilityRole="button" onPress={() => { setBrowsed(item); setPlatformMenu(false); }} style={{ paddingVertical: 10 }}>
                  <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{platformNames[item]}</Text>
                </Pressable>
              )) : platform !== "unknown" ? (
                <AccountCard
                  key={platform}
                  family={platform}
                  rows={accounts.filter((a) => a.family === platform)}
                  live={platform === "codex" ? liveCodex : platform === "xai" ? liveGrok : liveGo}
                  theme={theme}
                  pending={switchMut.isPending}
                  onSelect={(id) => switchMut.mutate(id)}
                />
              ) : <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, paddingVertical: 16 }}>当前模型暂无额度来源</Text>}
            </ScrollView>
            {switchMut.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>切换失败，请稍后重试</Text> : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

export function contributePills(client: PluginClientContext) {
  const pills = new Map<string, { workspaceId: string; cleanup: () => void }>();
  let stopped = false;

  function remove(agentId: string) {
    pillPanels.get(agentId)?.close();
    pills.get(agentId)?.cleanup();
    pills.delete(agentId);
  }

  function upsert(agent: { id: string; workspaceId?: string }) {
    const { id: agentId, workspaceId } = agent;
    if (workspaceId && pills.get(agentId)?.workspaceId === workspaceId) return;
    remove(agentId);
    if (!workspaceId) return;
    const clean = client.addComposerPill({
      id: "ttz-quota",
      title: "铁铁汁",
      workspaceId,
      agentId,
      Component: CombinedPill,
      onPress() {
        pillPanels.get(agentId)?.open();
      },
    });
    pills.set(agentId, { workspaceId, cleanup: clean });
  }

  const unsubscribe = client.paseo.agents.subscribe((update) => {
    if (update.kind === "remove") remove(update.agentId);
    else upsert(update.agent);
  });

  void (async () => {
    let cursor: string | undefined;
    do {
      const { entries, pageInfo } = await client.paseo.agents.list({
        scope: "active",
        page: { limit: 200, cursor },
      });
      if (stopped) return;
      for (const { agent } of entries) upsert(agent);
      if (!pageInfo.hasMore) return;
      cursor = pageInfo.nextCursor ?? undefined;
    } while (!stopped);
  })().catch((error: unknown) => {
    console.error("ttz pills init failed", error);
  });

  return () => {
    stopped = true;
    unsubscribe?.();
    for (const id of [...pills.keys()]) remove(id);
  };
}

function Btn({
  label,
  onPress,
  theme,
  accent,
  pending,
}: {
  label: string;
  onPress: () => void;
  theme: PluginSurfaceProps["theme"];
  accent?: boolean;
  pending?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!pending }}
      disabled={pending}
      onPress={onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        backgroundColor: accent ? theme.colors.accent : theme.colors.surface2,
        opacity: pending ? 0.6 : 1,
      }}
    >
      <Text
        style={{
          color: accent ? theme.colors.accentForeground : theme.colors.foreground,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SettingsSurface({ theme, layout }: PluginSurfaceProps) {
  const quota = useQuota();
  useAutoQuotaRefresh(true);
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), 30_000);
    return () => clearTimeout(timer);
  }, [cooling]);
  const qc = useQueryClient();
  const setCache = (data: typeof quota.data) => qc.setQueryData(["ttz-quota"], data);
  const refresh = useRpc(refreshQuota);
  const importing = useRpc(importAuth);
  const switching = useRpc(switchAccount);
  const refreshing = useMutation({
    mutationFn: () => refresh({}),
    onSuccess: setCache,
  });
  const importMut = useMutation({
    mutationFn: () => importing({}),
    onSuccess: setCache,
  });
  const switchMut = useMutation({
    mutationFn: (id: string) => switching({ id }),
    onSuccess: setCache,
  });
  const pad = layout.compact ? 12 : 16;
  const accounts = quota.data?.accounts ?? [];
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [action, setAction] = useState<"import" | Family | null>(null);
  const [loginFamily, setLoginFamily] = useState<Family | null>(null);
  const busy = refreshing.isPending || importMut.isPending || !!loginFamily || switchMut.isPending;
  const actionError = refreshing.isError || importMut.isError || switchMut.isError;
  const runAction = () => {
    if (action === "import") importMut.mutate();
    else if (action) setLoginFamily(action);
    setAction(null);
    setMenuOpen(false);
  };
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView contentContainerStyle={{ padding: pad, gap: 12, width: "100%", maxWidth: 680, alignSelf: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>铁铁汁</Text>
          <View style={{ flexDirection: "row", gap: 4 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={cooling ? "刷新冷却中，30秒后可重试" : "刷新额度"} disabled={busy || cooling} onPress={() => { setCooling(true); refreshing.mutate(); }} style={{ minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center", opacity: busy || cooling ? 0.4 : 1 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 20 }}>{refreshing.isPending ? "…" : "↻"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="账号管理菜单" accessibilityState={{ expanded: menuOpen }} onPress={() => { setMenuOpen(!menuOpen); setAction(null); }} style={{ minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 22 }}>⋯</Text>
            </Pressable>
          </View>
        </View>
        {menuOpen ? <View style={{ borderBottomWidth: 1, borderColor: theme.colors.border, paddingBottom: 12, gap: 4 }}>
          {([ ["codex", "登录 Codex"], ["xai", "登录 Grok"], ["go", "添加 OpenCode Go Key"], ["import", "从本机导入账号"] ] as const).map(([id, label]) => (
            <Pressable key={id} accessibilityRole="button" disabled={busy} onPress={() => setAction(id)} style={{ paddingHorizontal: 8, minHeight: 40, justifyContent: "center", opacity: busy ? 0.4 : 1 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{label}</Text>
            </Pressable>
          ))}
          <Pressable accessibilityRole="button" onPress={() => { setShowUpdates(!showUpdates); setAction(null); }} style={{ paddingHorizontal: 8, minHeight: 40, justifyContent: "center" }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>检查更新 · v{VERSION}</Text>
          </Pressable>
          {showUpdates ? <UpdatePanel theme={theme} /> : null}
          {action ? <View style={{ padding: 8, gap: 10 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>{action === "import" ? "读取主机上的 Pi auth.json（含 Go API Key），不是上传文件；会先备份，再覆盖同名账号凭据。" : action === "go" ? "输入 OpenCode Go API Key，验证额度权限后保存。" : "将生成设备验证码，在官方验证页输入后即可自动完成授权，无需粘贴回调地址。"}</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Btn label="取消" theme={theme} onPress={() => setAction(null)} />
              <Btn label="继续" theme={theme} pending={busy} accent onPress={runAction} />
            </View>
          </View> : null}
        </View> : null}
        {loginFamily === "go" ? <GoKeyPanel theme={theme} onClose={() => setLoginFamily(null)} /> : loginFamily ? <LoginPanel key={loginFamily} family={loginFamily} theme={theme} onClose={() => setLoginFamily(null)} /> : null}
        {importMut.isPending ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>正在导入…</Text> : null}
        {actionError || quota.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>操作失败，请稍后重试。</Text> : null}
        {accounts.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
            暂无账号，点右上角 ⋯ 添加。
          </Text>
        ) : null}
        {(["codex", "xai", "go"] as const).map((family) => {
          const rows = accounts.filter((a) => a.family === family);
          if (rows.length === 0) return null;
          return (
            <View key={family} style={{ gap: 8, paddingTop: 12, borderTopWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, letterSpacing: 1 }}>
                {platformNames[family]}
              </Text>
              <AccountCard
                family={family}
                rows={rows}
                live={rows.find((account) => account.id === quota.data?.preferred[family])}
                theme={theme}
                pending={busy}
                onSelect={(id) => switchMut.mutate(id)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
