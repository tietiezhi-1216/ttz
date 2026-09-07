import React, { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { gamedevArchive, gamedevDetail, gamedevDispatch, gamedevList, gamedevThread, type GameNode, type HostLoad } from "./gamedev.shared";
import { Markdown } from "./markdown.client";

type Theme = PluginSurfaceProps["theme"];

function rpcError(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error);
  if (code.includes("GAMEDEV_TIMEOUT")) return "请求超时，请稍后重试";
  if (code.includes("GAMEDEV_NO_CLI")) return "未找到 paseo，请更新插件重试";
  if (code.includes("GAMEDEV_EMPTY")) return "请输入内容";
  if (code.includes("GAMEDEV_REFUSE")) return "只能归档数字号游戏 Agent，协调/功能号请去原生侧栏处理";
  if (code.includes("GAMEDEV_RUNNING")) return "它正在运行，先等它做完再归档";
  return code.length > 160 ? code.slice(0, 160) : code || "请求失败";
}

function StatusDot({ status, theme, size }: { status: string; theme: Theme; size?: number }) {
  const dim = size ?? 11;
  const color =
    status === "running" ? theme.colors.accent
    : status === "idle" ? theme.colors.statusSuccess
    : theme.colors.foregroundMuted;
  return <View style={{ width: dim, height: dim, borderRadius: dim / 2, backgroundColor: color }} />;
}

function PendingBadge({ count, theme }: { count: number; theme: Theme }) {
  if (count <= 0) return null;
  return (
    <View style={{ backgroundColor: theme.colors.surface2, borderRadius: 9, paddingVertical: 2, paddingHorizontal: 7 }}>
      <Text style={{ color: theme.colors.statusWarning, fontSize: 10, fontWeight: "700" }}>待合{count}</Text>
    </View>
  );
}

function NodeCard({ node, theme, cardWidth, onPress }: {
  node: GameNode;
  theme: Theme;
  cardWidth: number | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`游戏 ${node.gameId}`}
      onPress={onPress}
      style={{
        width: cardWidth ?? "48%",
        flexShrink: 0,
        backgroundColor: theme.colors.surface1,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        gap: 5,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
        <StatusDot status={node.status} theme={theme} />
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700" }}>{node.gameId}</Text>
        <View style={{ flex: 1 }} />
        <PendingBadge count={node.pendingCount} theme={theme} />
      </View>
      <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
        {node.title ?? (node.model ?? "")}
      </Text>
    </Pressable>
  );
}

function HostStats({ hosts, theme }: { hosts: HostLoad[]; theme: Theme }) {
  if (hosts.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {hosts.map((host) => (
        <View
          key={host.hostId}
          style={{ flex: 1, backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 10, gap: 2 }}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "700" }}>
            {(host.providers[0] ?? host.hostId).toUpperCase()}
          </Text>
          <Text style={{ color: theme.colors.foreground, fontSize: 20, fontWeight: "700" }}>{host.total}</Text>
          <Text numberOfLines={1} style={{ color: host.error ? theme.colors.statusDanger : theme.colors.foregroundMuted, fontSize: 10 }}>
            {host.error ? host.error : `${host.running} 运行中`}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Hub({ theme, coordStatus, coordName, draft, setDraft }: {
  theme: Theme;
  coordStatus: string | null;
  coordName: string | null;
  draft: string;
  setDraft: (text: string) => void;
}) {
  const dispatchRpc = useRpc(gamedevDispatch);
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const send = useMutation({
    mutationFn: () => dispatchRpc({ text: draft.trim() }),
    onSuccess: () => {
      setDraft("");
      setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["ttz-gamedev-list"] });
    },
  });
  return (
    <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <StatusDot status={coordStatus ?? "unknown"} theme={theme} size={9} />
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700" }}>分发点</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          {coordName ?? "协调"} · {coordStatus ?? "未知"}
        </Text>
      </View>
      <TextInput
        accessibilityLabel="分发内容"
        placeholder="例如：开发 TaDa 109"
        placeholderTextColor={theme.colors.foregroundMuted}
        value={draft}
        onChangeText={(text) => { setDraft(text); setConfirming(false); }}
        editable={!send.isPending}
        multiline
        maxLength={2000}
        style={{
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface2,
          borderRadius: 9,
          padding: 10,
          fontSize: 13,
          minHeight: 44,
          textAlignVertical: "top",
        }}
      />
      {send.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{rpcError(send.error)}</Text> : null}
      {send.isSuccess ? <Text style={{ color: theme.colors.statusSuccess, fontSize: 11 }}>已转给协调，合入后会更新。</Text> : null}
      {confirming ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          <Pressable accessibilityRole="button" onPress={() => setConfirming(false)} style={{ padding: 10 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>取消</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={send.isPending}
            onPress={() => send.mutate()}
            style={{ backgroundColor: theme.colors.accent, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 20 }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "700" }}>
              {send.isPending ? "发送中…" : "确认分发"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="分发"
            disabled={!draft.trim() || send.isPending}
            onPress={() => setConfirming(true)}
            style={{
              backgroundColor: theme.colors.accent,
              borderRadius: 9,
              paddingVertical: 10,
              paddingHorizontal: 22,
              opacity: !draft.trim() || send.isPending ? 0.35 : 1,
            }}
          >
            <Text style={{ color: theme.colors.accentForeground, fontSize: 13, fontWeight: "700" }}>分发</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ThreadCard({ shortId, host, theme }: { shortId: string; host: string; theme: Theme }) {
  const threadRpc = useRpc(gamedevThread);
  const thread = useQuery({
    queryKey: ["ttz-gamedev-thread", shortId, host],
    queryFn: () => threadRpc({ shortId, host, tail: 30 }),
    staleTime: 60_000,
    retry: 1,
  });
  return (
    <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700" }}>最近动态</Text>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="刷新动态"
          disabled={thread.isFetching}
          onPress={() => { void thread.refetch(); }}
          style={{ minWidth: 36, minHeight: 36, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 17 }}>{thread.isFetching ? "…" : "↻"}</Text>
        </Pressable>
      </View>
      {thread.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{rpcError(thread.error)}</Text> : null}
      {thread.data ? (
        <View style={{ backgroundColor: theme.colors.surface2, borderRadius: 8, padding: 10 }}>
          <Text style={{ color: theme.colors.foreground, fontSize: 11, fontFamily: "monospace" }}>{thread.data.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Legend({ theme }: { theme: Theme }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <StatusDot status="idle" theme={theme} size={9} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>空闲</Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <StatusDot status="running" theme={theme} size={9} />
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>运行中</Text>
      </View>
      <PendingBadge count={1} theme={theme} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>= 门口待合入分支数，点卡看详情</Text>
    </View>
  );
}

function HelpCard({ theme }: { theme: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "700" }}>面板怎么用{open ? " ▾" : " ▸"}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 5 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>1. 找游戏：搜 7 位 ID 或名字，不用翻 workspace。</Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>2. 点卡看详情：门口分支、规则摘要、最近动态都在里面，还能一键跳到对话。</Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>3. 派活：在分发点输入「开发 TaDa 109」，转给协调跟进合入。</Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>4. 清理：详情页可归档废弃的数字号 Agent（软删除，运行中不可归档）。</Text>
        </View>
      ) : null}
    </View>
  );
}

function ArchiveBlock({ shortId, host, status, theme, onDone }: {
  shortId: string;
  host: string;
  status: string;
  theme: Theme;
  onDone: () => void;
}) {
  const archiveRpc = useRpc(gamedevArchive);
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const archive = useMutation({
    mutationFn: () => archiveRpc({ shortId, host }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ttz-gamedev-list"] });
      onDone();
    },
  });
  const running = status === "running";
  return (
    <View style={{ gap: 6 }}>
      {archive.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{rpcError(archive.error)}</Text> : null}
      {confirming ? (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, flex: 1 }}>归档后侧栏不再显示。请确认该号已废弃（重复号/占位号）。</Text>
          <Pressable accessibilityRole="button" onPress={() => setConfirming(false)} style={{ padding: 10 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>取消</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={archive.isPending} onPress={() => archive.mutate()} style={{ padding: 10 }}>
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12, fontWeight: "700" }}>
              {archive.isPending ? "归档中…" : "确认归档"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="归档此 Agent"
            disabled={running}
            onPress={() => setConfirming(true)}
            style={{ paddingVertical: 8, opacity: running ? 0.35 : 1 }}
          >
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>
              {running ? "运行中，不可归档" : "归档此 Agent"}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function Detail({ gameId, host, hostId, shortId, agentId, theme, canOpen, onOpen, onBack, onSupplement }: {
  gameId: string;
  host: string;
  hostId: string;
  shortId: string;
  agentId: string;
  theme: Theme;
  canOpen: boolean;
  onOpen: () => void;
  onBack: () => void;
  onSupplement: (gameId: string) => void;
}) {
  const detailRpc = useRpc(gamedevDetail);
  const detail = useQuery({
    queryKey: ["ttz-gamedev-detail", gameId, host, shortId],
    queryFn: () => detailRpc({ gameId, host, shortId }),
    staleTime: 30_000,
    retry: 1,
  });
  const data = detail.data;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={8} onPress={onBack} style={{ minHeight: 40, justifyContent: "center", paddingRight: 6 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 16 }}>‹ 返回</Text>
        </Pressable>
        <StatusDot status={data?.status ?? "unknown"} theme={theme} />
        <Text style={{ color: theme.colors.foreground, fontSize: 17, fontWeight: "700" }}>{gameId}</Text>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="刷新" onPress={() => { void detail.refetch(); }} style={{ minHeight: 40, minWidth: 40, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 18 }}>{detail.isFetching ? "…" : "↻"}</Text>
        </Pressable>
      </View>
      {detail.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{rpcError(detail.error)}</Text> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 4 }}>
            {data.title ? <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700" }}>{data.title}</Text> : null}
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {[data.provider, data.externalId ? `外部 ${data.externalId}` : null, data.vendorId ? `厂商 ${data.vendorId}` : null].filter(Boolean).join(" · ")}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              {data.host} · {data.status}{data.model ? ` · ${data.model}` : ""}{typeof data.costUsd === "number" ? ` · $${data.costUsd}` : ""}
            </Text>
          </View>
          <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700" }}>门口分支</Text>
              <PendingBadge count={data.pendingBranches.length} theme={theme} />
              {data.pendingBranches.length === 0 ? (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>无待合入</Text>
              ) : null}
            </View>
            {data.pendingBranches.map((branch) => (
              <View key={branch} style={{ backgroundColor: theme.colors.surface2, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
                <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12, fontFamily: "monospace" }}>{branch}</Text>
              </View>
            ))}
          </View>
          {data.rulesSummary ? (
            <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700" }}>规则摘要</Text>
                {data.rulesSource === "vendor" ? (
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>目录已就绪，身份块待补</Text>
                ) : null}
              </View>
              <Markdown text={data.rulesSummary} theme={theme} />
            </View>
          ) : (
            <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12, gap: 4 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>仓库暂无该游戏目录</Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                这是先占位的 Agent（先有号、后有游戏），规则在游戏进仓后自动出现，不影响派活和看动态。
              </Text>
            </View>
          )}
          <ThreadCard shortId={shortId} host={host} theme={theme} />
          {!canOpen ? (
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              对话在 {hostId} 上：去那台机器的「游戏开发」面板打开此卡（同名同号）。
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            {canOpen ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="打开对话"
                onPress={onOpen}
                style={{ flex: 1, backgroundColor: theme.colors.surface2, borderRadius: 10, minHeight: 46, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700" }}>打开对话</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="补充要求"
              onPress={() => onSupplement(data.gameId)}
              style={{ flex: 1, backgroundColor: theme.colors.accent, borderRadius: 10, minHeight: 46, alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ color: theme.colors.accentForeground, fontSize: 14, fontWeight: "700" }}>补充要求</Text>
            </Pressable>
          </View>
          <ArchiveBlock shortId={shortId} host={host} status={data.status} theme={theme} onDone={onBack} />
        </View>
      ) : null}
    </View>
  );
}

const PROVIDERS = ["全部", "jili", "tada", "hacksaw"];

export function GameDevSurface({ theme, navigation }: PluginSurfaceProps) {
  const canOpen = typeof navigation?.openAgent === "function";
  const listRpc = useRpc(gamedevList);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("全部");
  const [selected, setSelected] = useState<{ gameId: string; host: string; hostId: string; shortId: string; agentId: string; jumpable: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [contentW, setContentW] = useState(0);
  const gap = 10;
  const minCard = 240;
  const maxCols = 6;
  const numCols = contentW > 0 ? Math.min(maxCols, Math.max(1, Math.floor((contentW + gap) / (minCard + gap)))) : 2;
  const cardWidth = contentW > 0 ? (contentW - (numCols - 1) * gap) / numCols : null;
  const list = useQuery({
    queryKey: ["ttz-gamedev-list"],
    queryFn: () => listRpc({}),
    staleTime: 30_000,
    retry: 1,
  });
  const isLocal = list.data?.mode === "local";
  const q = query.trim().toLowerCase();
  const nodes = (list.data?.nodes ?? []).filter((node) =>
    (provider === "全部" || node.provider === provider) &&
    (!q || node.gameId.includes(q) || (node.title ?? "").toLowerCase().includes(q)),
  );
  const groups = new Map<string, GameNode[]>();
  for (const node of nodes) {
    const key = node.provider || "unknown";
    const arr = groups.get(key);
    if (arr) arr.push(node);
    else groups.set(key, [node]);
  }
  if (selected) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 8, maxWidth: 720, width: "100%", alignSelf: "center" }}>
          <Detail
            gameId={selected.gameId}
            host={selected.host}
            hostId={selected.hostId}
            shortId={selected.shortId}
            agentId={selected.agentId}
            theme={theme}
            canOpen={canOpen && selected.jumpable}
            onOpen={() => {
              try { navigation?.openAgent({ agentId: selected.agentId }); } catch { /* older host: no-op */ }
            }}
            onBack={() => setSelected(null)}
            onSupplement={(gameId) => {
              setDraft(`给 ${gameId} 补充要求：`);
              setSelected(null);
            }}
          />
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 12, maxWidth: 1280, width: "100%", alignSelf: "center" }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface1, borderRadius: 10, paddingHorizontal: 12 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 15 }}>⌕</Text>
            <TextInput
              accessibilityLabel="搜索游戏"
              placeholder="搜 ID 或名字"
              placeholderTextColor={theme.colors.foregroundMuted}
              value={query}
              onChangeText={setQuery}
              maxLength={60}
              style={{ flex: 1, color: theme.colors.foreground, fontSize: 13, paddingVertical: 11, paddingHorizontal: 8 }}
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="清空搜索" hitSlop={8} onPress={() => setQuery("")}>
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 15 }}>✕</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="刷新"
            disabled={list.isFetching}
            onPress={() => { void list.refetch(); }}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface1, borderRadius: 10 }}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 19 }}>{list.isFetching ? "…" : "↻"}</Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", backgroundColor: theme.colors.surface1, borderRadius: 10, padding: 4, gap: 4 }}>
          {PROVIDERS.map((name) => {
            const active = provider === name;
            return (
              <Pressable
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setProvider(name)}
                style={{
                  flex: 1,
                  backgroundColor: active ? theme.colors.accent : "transparent",
                  borderRadius: 7,
                  paddingVertical: 8,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: active ? theme.colors.accentForeground : theme.colors.foregroundMuted, fontSize: 12, fontWeight: active ? "700" : "400" }}>
                  {name}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {list.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{rpcError(list.error)}</Text> : null}
        <Legend theme={theme} />
        <HostStats hosts={list.data?.hosts ?? []} theme={theme} />
        {isLocal ? (
          <View style={{ backgroundColor: theme.colors.surface1, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "700" }}>本机面板 · 点卡可直接跳到对话</Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>分发派活请到 80 的总览面板，其他机器的号在各自面板打开。</Text>
          </View>
        ) : (
          <Hub
            theme={theme}
            coordStatus={list.data?.coordinator?.status ?? null}
            coordName={list.data?.coordinator?.name ?? null}
            draft={draft}
            setDraft={setDraft}
          />
        )}
        <View
          style={{ gap: 12 }}
          onLayout={(event) => {
            const w = event.nativeEvent.layout.width;
            if (Math.abs(w - contentW) > 1) setContentW(w);
          }}
        >
        {[...groups.entries()].map(([key, arr]) => (
          <View key={key} style={{ gap: 8 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" }}>
              {key.toUpperCase()} · {arr.length}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "flex-start" }}>
              {arr.map((node) => (
                <NodeCard
                  key={`${node.hostId}-${node.shortId}`}
                  node={node}
                  theme={theme}
                  cardWidth={cardWidth}
                  onPress={() => setSelected({ gameId: node.gameId, host: node.host, hostId: node.hostId, shortId: node.shortId, agentId: node.agentId, jumpable: node.jumpable })}
                />
              ))}
            </View>
          </View>
        ))}
        {!list.isFetching && nodes.length === 0 && !list.isError ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>没有匹配的游戏 Agent。</Text>
        ) : null}
        <HelpCard theme={theme} />
        </View>
      </ScrollView>
    </View>
  );
}
