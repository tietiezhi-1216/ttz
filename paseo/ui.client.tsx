import type {
  PluginClientContext,
  PluginComposerPillProps,
  PluginSurfaceProps,
} from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  getQuota,
  importAuth,
  loginAccount,
  refreshQuota,
  switchAccount,
  type Family,
} from "./shared";

function usageColor(percent: number | null, fallback: string) {
  if (percent === null) return fallback;
  if (percent >= 95) return "#ef4444";
  if (percent >= 80) return "#f97316";
  if (percent >= 50) return "#eab308";
  return "#22c55e";
}

function formatReset(resetAt: number | null) {
  if (!resetAt) return "重置未知";
  const ms = resetAt - Date.now();
  if (ms <= 0) return "已到重置";
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `${hours}小时后重置`;
  return `${Math.round(hours / 24)}天后重置`;
}

function useQuota() {
  const rpc = useRpc(getQuota);
  return useQuery({
    queryKey: ["ttz-quota"],
    queryFn: () => rpc({}),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });
}

function FamilyPill({ family, theme }: PluginComposerPillProps & { family: Family }) {
  const quota = useQuota();
  const count = quota.data?.families[family]?.accountCount ?? 0;
  if (count === 0) return null;
  const percent = quota.data?.families[family]?.usedPercent ?? null;
  const name = family === "codex" ? "Codex" : "Grok";
  return (
    <Text
      numberOfLines={1}
      style={{
        color: usageColor(percent, theme.colors.foregroundMuted),
        flexShrink: 1,
        fontSize: 12,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
      }}
    >
      {percent === null ? `${name} —` : `${name} ${Math.round(percent)}%`}
    </Text>
  );
}

function PreferredPill({ theme }: PluginComposerPillProps) {
  const quota = useQuota();
  const row = quota.data?.accounts.find((account) => account.id === quota.data?.preferredId);
  return (
    <Text
      numberOfLines={1}
      style={{ color: theme.colors.foregroundMuted, flexShrink: 1, fontSize: 12, fontWeight: "600" }}
    >
      {row ? `当前 ${row.label}` : "铁铁汁"}
    </Text>
  );
}

export function contributePills(client: PluginClientContext) {
  const pills = new Map<string, () => void>();
  let stopped = false;

  function remove(agentId: string) {
    pills.get(agentId)?.();
    pills.delete(agentId);
  }

  function upsert(agent: { id: string; workspaceId?: string }) {
    const { id: agentId, workspaceId } = agent;
    remove(agentId);
    if (!workspaceId) return;
    const clean = [
      client.addComposerPill({
        id: "ttz-codex",
        title: "Codex 额度",
        workspaceId,
        agentId,
        Component: (props) => <FamilyPill {...props} family="codex" />,
        onPress() {
          client.openSurface("ttz-settings");
        },
      }),
      client.addComposerPill({
        id: "ttz-grok",
        title: "Grok 额度",
        workspaceId,
        agentId,
        Component: (props) => <FamilyPill {...props} family="xai" />,
        onPress() {
          client.openSurface("ttz-settings");
        },
      }),
      client.addComposerPill({
        id: "ttz-preferred",
        title: "铁铁汁",
        workspaceId,
        agentId,
        Component: PreferredPill,
        onPress() {
          client.openSurface("ttz-settings");
        },
      }),
    ];
    pills.set(agentId, () => {
      for (const fn of clean) fn();
    });
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
  const qc = useQueryClient();
  const setCache = (data: typeof quota.data) => qc.setQueryData(["ttz-quota"], data);
  const refresh = useRpc(refreshQuota);
  const importing = useRpc(importAuth);
  const logging = useRpc(loginAccount);
  const switching = useRpc(switchAccount);
  const refreshing = useMutation({
    mutationFn: () => refresh({}),
    onSuccess: setCache,
  });
  const importMut = useMutation({
    mutationFn: () => importing({}),
    onSuccess: setCache,
  });
  const loginMut = useMutation({
    mutationFn: (family: Family) => logging({ family }),
    onSuccess: setCache,
  });
  const switchMut = useMutation({
    mutationFn: (id: string) => switching({ id }),
    onSuccess: setCache,
  });
  const pad = layout.compact ? 12 : 16;
  const accounts = quota.data?.accounts ?? [];
  const notice = quota.data?.notice;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView contentContainerStyle={{ padding: pad, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>铁铁汁</Text>
          <Btn
            label={refreshing.isPending ? "刷新中" : "刷新额度"}
            onPress={() => refreshing.mutate()}
            theme={theme}
            accent
            pending={refreshing.isPending}
          />
        </View>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>
          登录会直接打开浏览器。完成授权后账号会出现在下面。选用会写回 Pi 并重启 daemon，当前对话会断。
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Btn
            label={importMut.isPending ? "导入中" : "导入 auth.json"}
            onPress={() => importMut.mutate()}
            theme={theme}
            pending={importMut.isPending}
          />
          <Btn
            label="登录 Codex"
            onPress={() => loginMut.mutate("codex")}
            theme={theme}
            pending={loginMut.isPending}
          />
          <Btn
            label="登录 Grok"
            onPress={() => loginMut.mutate("xai")}
            theme={theme}
            pending={loginMut.isPending}
          />
        </View>
        {notice ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{notice}</Text>
        ) : null}
        {accounts.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
            还没有账号。先登录或导入 auth.json。
          </Text>
        ) : null}
        {(["codex", "xai"] as const).map((family) => {
          const rows = accounts.filter((a) => a.family === family);
          if (rows.length === 0) return null;
          return (
            <View key={family} style={{ gap: 8 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, letterSpacing: 1 }}>
                {family === "codex" ? "CODEX" : "GROK"}
              </Text>
              {rows.map((a) => {
                const pct = a.usedPercent;
                const color = usageColor(pct, theme.colors.foregroundMuted);
                const active = quota.data?.preferredId === a.id;
                return (
                  <View key={a.id} style={{ gap: 6, padding: 10, backgroundColor: theme.colors.surface1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700" }}>
                        {a.label}
                      </Text>
                      <Text style={{ color, fontSize: 14, fontWeight: "700" }}>
                        {pct === null ? "—" : `${pct}%`}
                      </Text>
                    </View>
                    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                      {a.id}
                      {a.authType ? ` · ${a.authType}` : ""}
                      {a.plan ? ` · ${a.plan}` : ""}
                      {a.serviceable === false ? " · 不可用" : ""}
                      {" · "}
                      {formatReset(a.resetAt)}
                    </Text>
                    <View style={{ height: 4, backgroundColor: theme.colors.border }}>
                      <View
                        style={{
                          width: `${Math.min(100, Math.max(0, pct ?? 0))}%`,
                          height: 4,
                          backgroundColor: color,
                        }}
                      />
                    </View>
                    {a.error ? (
                      <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{a.error}</Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => switchMut.mutate(a.id)}
                      style={{
                        alignSelf: "flex-start",
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        backgroundColor: active ? theme.colors.accent : theme.colors.surface2,
                        opacity: switchMut.isPending ? 0.6 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: active ? theme.colors.accentForeground : theme.colors.foreground,
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {active ? "当前" : "选用并重启"}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
