import React, { useEffect, useRef, useState } from "react";
import { AppState, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRpc, type PluginAgentPanelProps, type PluginSurfaceProps, type PluginWorkspacePanelProps } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { grokbotList, grokbotSend, grokbotThread, grokbotCreate, grokbotUpdate, grokbotDelete, grokbotMarkRead, grokbotProfiles, grokbotSaveProfile, grokbotSetProfile, grokbotDeleteProfile, type GrokBotTarget, type GrokBotEntry, type GrokBotProfile } from "./grokbot.shared";
import { BotAvatar, AVATAR_SHAPES, OFFICIAL_COLORS, avatarTint } from "./avatar.client";
import { AVATAR_IMAGES } from "./avatar-images";
import { Markdown, CopyButton } from "./markdown.client";

function targetError(error: unknown): string {
  const code = String(error instanceof Error ? error.message : "");
  if (code.includes("GBOT_MISSING")) return "未找到 gbot，请更新插件重试";
  if (code.includes("GBOT_TIMEOUT")) return "请求超时，请稍后重试";
  if (code.includes("ENOENT") || code.includes("GBOT_SPAWN")) return "无法启动 gbot";
  if (code.includes("GBOT_BAD_OUTPUT")) return "gbot 输出异常，可能需要更新插件";
  if (code.includes("GBOT_PROFILE_NAME")) return "代号只可用字母、数字、-和_";
  if (code.includes("GBOT_NO_SESSION")) return "本机没有 Grok Bot 登录，先在 App 里登录";
  if (code.includes("GBOT_MULTI_ENTRY")) return "本机登录有多个会话，请重登 App 后重试";
  if (code.includes("GBOT_PROFILE_MISSING")) return "该身份不存在，可能已被删除";
  if (!code || code.indexOf("GBOT_") === 0) return "请求失败，请稍后重试";
  return code.length > 160 ? code.slice(0, 160) : code;
}

function formatAbsolute(timestampMs: number | null): string {
  if (!timestampMs) return "";
  const at = new Date(timestampMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = pad(at.getHours()) + ":" + pad(at.getMinutes());
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((day.getTime() - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) / 86400000);
  if (diffDays <= 0) return "今天 " + clock;
  if (diffDays === 1) return "昨天 " + clock;
  return (at.getMonth() + 1) + "/" + at.getDate() + " " + clock;
}

function TargetRow({ target, theme, isGroup, onPress, onEdit }: { target: GrokBotTarget; theme: PluginSurfaceProps["theme"]; isGroup: boolean; onPress: () => void; onEdit: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`打开 ${target.name} 会话`} onPress={onPress} style={{ flexDirection: "row", gap: 10, paddingVertical: 10, alignItems: "center" }}>
      <BotAvatar id={target.id} name={target.name} shape={target.avatarShape} color={target.avatarColor} size={34} status={target.busy ? "working" : target.unread ? "unread" : null} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600", flex: 1 }}>{target.name}</Text>
          {target.lastActiveAt ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, flexShrink: 0 }}>{formatAbsolute(target.lastActiveAt)}</Text> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11, flex: 1 }}>
            {isGroup ? `群组 · ${target.memberCount}人 · ` : ""}{target.lastPreview ?? ""}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`编辑 ${target.name}`} hitSlop={8} onPress={onEdit} style={{ minHeight: 32, justifyContent: "center", paddingHorizontal: 4 }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 14 }}>✎</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export type BotFormData = {
  name: string;
  title: string;
  description: string;
  avatarShape: string;
  avatarColor: string;
  notify: boolean;
  hidden: boolean;
};

function FieldLabel({ text, theme }: { text: string; theme: PluginSurfaceProps["theme"] }) {
  return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{text}</Text>;
}

function BotForm({ initial, theme, saving, error, onSave, onDelete, deleting }: {
  initial: GrokBotTarget | null;
  theme: PluginSurfaceProps["theme"];
  saving: boolean;
  error: string | null;
  onSave: (data: BotFormData) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [shape, setShape] = useState(initial?.avatarShape ?? "");
  const [color, setColor] = useState(initial?.avatarColor ?? "");
  const [notify, setNotify] = useState(initial?.notify ?? true);
  const [hidden, setHidden] = useState(initial?.hidden ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputStyle = {
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
  };
  const changed = !initial
    || name.trim() !== initial.name
    || title.trim() !== (initial.title ?? "")
    || description.trim() !== (initial.description ?? "")
    || shape !== (initial.avatarShape ?? "")
    || color !== (initial.avatarColor ?? "")
    || notify !== (initial.notify ?? true)
    || hidden !== (initial.hidden ?? false);
  const valid = name.trim().length > 0 && changed && !saving;
  const previewTint = (color && OFFICIAL_COLORS[color]) || theme.colors.foregroundMuted;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <BotAvatar
          id={initial?.id ?? name.trim()}
          name={name.trim() || "新机器人"}
          shape={shape || null}
          color={color || null}
          size={48}
        />
        <View style={{ flex: 1, gap: 6 }}>
          <FieldLabel text="名字" theme={theme} />
          <TextInput
            accessibilityLabel="机器人名字"
            placeholder="例如：调研秘书"
            placeholderTextColor={theme.colors.foregroundMuted}
            value={name}
            onChangeText={setName}
            editable={!saving}
            maxLength={60}
            style={inputStyle}
          />
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <FieldLabel text="备注标题（可选）" theme={theme} />
        <TextInput
          accessibilityLabel="备注标题"
          value={title}
          onChangeText={setTitle}
          editable={!saving}
          maxLength={120}
          style={inputStyle}
        />
      </View>
      <View style={{ gap: 6 }}>
        <FieldLabel text="说明指令" theme={theme} />
        <TextInput
          accessibilityLabel="说明指令"
          placeholder="这个机器人负责什么、遵守什么规则…"
          placeholderTextColor={theme.colors.foregroundMuted}
          value={description}
          onChangeText={setDescription}
          editable={!saving}
          multiline
          maxLength={4000}
          style={{ ...inputStyle, minHeight: 88, textAlignVertical: "top" }}
        />
      </View>
      <View style={{ gap: 6 }}>
        <FieldLabel text="头像形状" theme={theme} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {AVATAR_SHAPES.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="button"
              accessibilityLabel={item}
              accessibilityState={{ selected: shape === item }}
              disabled={saving}
              onPress={() => setShape(shape === item ? "" : item)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                borderWidth: shape === item ? 2 : 1,
                borderColor: shape === item ? theme.colors.foreground : theme.colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Image source={{ uri: AVATAR_IMAGES[item] }} resizeMode="contain" style={{ width: 30, height: 30, tintColor: previewTint }} />
            </Pressable>
          ))}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        <FieldLabel text="头像颜色" theme={theme} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {Object.keys(OFFICIAL_COLORS).map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={id}
              accessibilityState={{ selected: color === id }}
              disabled={saving}
              onPress={() => setColor(color === id ? "" : id)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: OFFICIAL_COLORS[id],
                borderWidth: color === id ? 2 : 0,
                borderColor: theme.colors.foreground,
              }}
            />
          ))}
        </View>
      </View>
      {initial ? (
        <View style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>任务更新通知</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => setNotify(true)} style={{ padding: 6 }}>
                <Text style={{ color: notify ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, fontWeight: notify ? "700" : "400" }}>开</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => setNotify(false)} style={{ padding: 6 }}>
                <Text style={{ color: !notify ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, fontWeight: !notify ? "700" : "400" }}>关</Text>
              </Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>在侧栏隐藏</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => setHidden(false)} style={{ padding: 6 }}>
                <Text style={{ color: !hidden ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, fontWeight: !hidden ? "700" : "400" }}>显示</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => setHidden(true)} style={{ padding: 6 }}>
                <Text style={{ color: hidden ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, fontWeight: hidden ? "700" : "400" }}>隐藏</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
      {error ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={initial ? "保存修改" : "创建机器人"}
        disabled={!valid}
        onPress={() => onSave({ name: name.trim(), title: title.trim(), description: description.trim(), avatarShape: shape, avatarColor: color, notify, hidden })}
        style={{ backgroundColor: theme.colors.surface1, borderRadius: 8, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: valid ? 1 : 0.4 }}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>{saving ? "保存中…" : initial ? "保存修改" : "创建机器人"}</Text>
      </Pressable>
      {initial && onDelete ? (
        confirmDelete ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>删除后无法恢复，确定删除 {initial.name}？</Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
              <Pressable accessibilityRole="button" disabled={deleting} onPress={() => setConfirmDelete(false)} style={{ padding: 8 }}>
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>取消</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={deleting} onPress={onDelete} style={{ padding: 8 }}>
                <Text style={{ color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" }}>{deleting ? "删除中…" : "确认删除"}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => setConfirmDelete(true)} style={{ alignSelf: "flex-start", paddingVertical: 8 }}>
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>删除机器人</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

type ThreadRow =
  | { kind: "time"; key: string; ts: number }
  | { kind: "mine"; entry: GrokBotEntry }
  | { kind: "flat"; entry: GrokBotEntry; label: string; tint: string; avatar: { id: string; shape: string | null; color: string | null } }
  | { kind: "peer"; key: string; name: string; count: number };

function buildThreadRows(
  entries: GrokBotEntry[],
  target: GrokBotTarget,
  byName: (name: string) => GrokBotTarget | null,
): ThreadRow[] {
  const rows: ThreadRow[] = [];
  const isGroup = target.memberCount > 0;
  let peerRun: { name: string; count: number; key: string } | null = null;
  const flushPeer = () => {
    if (peerRun) {
      rows.push({ kind: "peer", key: peerRun.key, name: peerRun.name, count: peerRun.count });
      peerRun = null;
    }
  };
  entries.forEach((entry, entryIndex) => {
    const prev = entryIndex > 0 ? entries[entryIndex - 1] : null;
    if ((!prev?.timestampMs || !entry.timestampMs || entry.timestampMs - prev.timestampMs > 30 * 60_000) && entry.timestampMs) {
      rows.push({ kind: "time", key: "t" + entry.id, ts: entry.timestampMs });
    }
    if (entry.author === "you") {
      flushPeer();
      rows.push({ kind: "mine", entry });
      return;
    }
    const foreign = !!entry.sender && entry.sender !== target.name;
    const resolved = entry.sender ? byName(entry.sender) : null;
    if (foreign && !isGroup && resolved) {
      if (peerRun && peerRun.name === resolved.name) peerRun.count += 1;
      else {
        flushPeer();
        peerRun = { name: resolved.name, count: 1, key: "p" + entry.id };
      }
      return;
    }
    flushPeer();
    const source = resolved ?? target;
    const label = entry.sender ?? target.name;
    rows.push({
      kind: "flat",
      entry,
      label,
      tint: avatarTint(source.id, label, source.avatarColor),
      avatar: { id: source.id, shape: source.avatarShape, color: source.avatarColor },
    });
  });
  flushPeer();
  return rows;
}

function FlatRow({ avatarId, avatarShape, avatarColor, name, nameColor, content, theme }: {
  avatarId: string;
  avatarShape: string | null;
  avatarColor: string | null;
  name: string;
  nameColor: string;
  content: string;
  theme: PluginSurfaceProps["theme"];
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      <BotAvatar id={avatarId} name={name} shape={avatarShape} color={avatarColor} size={20} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: nameColor, fontSize: 11, fontWeight: "600", flex: 1 }}>{name}</Text>
          <CopyButton text={content} theme={theme} label="复制" />
        </View>
        <Markdown text={content} theme={theme} />
      </View>
    </View>
  );
}

function PairPanel({ target, peerName, targets, theme, onBack, profile, profileLabel }: {
  target: GrokBotTarget;
  peerName: string;
  targets: GrokBotTarget[];
  theme: PluginSurfaceProps["theme"];
  onBack: () => void;
  profile: string | null;
  profileLabel: string | null;
}) {
  const threadRpc = useRpc(grokbotThread);
  const thread = useQuery({
    queryKey: ["ttz-grokbot-thread", profile ?? "live", target.id],
    queryFn: () => threadRpc({ target: target.name, limit: 30 }),
    staleTime: 15_000,
    retry: 1,
  });
  const peer = targets.find((item) => item.name === peerName) ?? null;
  const entries = (thread.data?.entries ?? []).filter(
    (entry) => entry.author === "bot" && (!entry.sender || entry.sender === peerName),
  );
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState && AppState.currentState !== "active") return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void thread.refetch();
    }, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id, profile]);
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={8} onPress={onBack} style={{ minHeight: 40, justifyContent: "center", paddingRight: 4 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 16 }}>‹ 返回</Text>
        </Pressable>
        <BotAvatar id={target.id} name={target.name} shape={target.avatarShape} color={target.avatarColor} size={24} />
        <BotAvatar id={peer?.id ?? ""} name={peerName} shape={peer?.avatarShape ?? null} color={peer?.avatarColor ?? null} size={24} />
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700", flex: 1 }}>
          {target.name} · {peerName}{profileLabel ? ` · ${profileLabel}` : ""}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="刷新" onPress={() => { void thread.refetch(); }} style={{ minHeight: 40, justifyContent: "center" }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 16 }}>{thread.isFetching ? "…" : "↻"}</Text>
        </Pressable>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
        {thread.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{targetError(thread.error)}</Text> : null}
        {entries.map((entry, entryIndex) => {
          const prev = entryIndex > 0 ? entries[entryIndex - 1] : null;
          const showTime = ((!prev?.timestampMs || !entry.timestampMs || entry.timestampMs - prev.timestampMs > 30 * 60_000) && entry.timestampMs);
          const source = entry.sender ? peer : null;
          const label = entry.sender ?? target.name;
          const avatarId = source?.id ?? (entry.sender ? "" : target.id);
          return (
            <View key={entry.id} style={{ gap: 4 }}>
              {showTime ? (
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, textAlign: "center" }}>{formatAbsolute(entry.timestampMs)}</Text>
              ) : null}
              <FlatRow
                avatarId={avatarId}
                avatarShape={source?.avatarShape ?? (entry.sender ? null : target.avatarShape)}
                avatarColor={source?.avatarColor ?? (entry.sender ? null : target.avatarColor)}
                name={label}
                nameColor={avatarTint(avatarId, label, source?.avatarColor ?? (entry.sender ? null : target.avatarColor))}
                content={entry.content}
                theme={theme}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ThreadView({ target, targets, theme, onBack, onOpenPeer, profile, profileLabel }: { target: GrokBotTarget; targets: GrokBotTarget[]; theme: PluginSurfaceProps["theme"]; onBack: () => void; onOpenPeer: (peer: GrokBotTarget) => void; profile: string | null; profileLabel: string | null }) {
  const threadRpc = useRpc(grokbotThread);
  const sendRpc = useRpc(grokbotSend);
  const markRpc = useRpc(grokbotMarkRead);
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const stickToBottom = useRef(true);
  useEffect(() => { stickToBottom.current = true; }, [target.id, profile]);
  const thread = useQuery({
    queryKey: ["ttz-grokbot-thread", profile ?? "live", target.id],
    queryFn: () => threadRpc({ target: target.name, limit: 30 }),
    staleTime: 15_000,
    retry: 1,
  });
  const send = useMutation({
    mutationFn: () => sendRpc({ target: target.name, message: draft.trim() }),
    onSuccess: () => {
      const seen = new Set<string>();
      for (const entry of thread.data?.entries ?? []) seen.add(entry.id);
      seenIds.current = seen;
      setWaiting({ startedAt: Date.now() });
      setTimedOut(false);
      stickToBottom.current = true;
      setDraft(""); setConfirming(false);
      void qc.invalidateQueries({ queryKey: ["ttz-grokbot-thread", profile ?? "live", target.id] });
      void qc.invalidateQueries({ queryKey: ["ttz-grokbot-list"] });
    },
  });
  const [waiting, setWaiting] = useState<{ startedAt: number } | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const seenIds = useRef<Set<string> | null>(null);
  const markedFor = useRef<string | null>(null);
  const markViewed = () => {
    if (markedFor.current === target.id) return;
    markedFor.current = target.id;
    void markRpc({ id: target.id })
      .then(() => { void qc.invalidateQueries({ queryKey: ["ttz-grokbot-list"] }); })
      .catch(() => { markedFor.current = null; });
  };
  const entries = thread.data?.entries ?? [];
  const liveTarget = targets.find((item) => item.id === target.id) ?? null;
  const statusText = waiting ? "等待回复…" : timedOut ? "暂未收到回复，可手动刷新" : null;
  const byName = (name: string): GrokBotTarget | null => {
    for (const candidate of targets) {
      if (candidate.name === name) return candidate;
    }
    return null;
  };
  useEffect(() => {
    setWaiting(null);
    setTimedOut(false);
    seenIds.current = null;
    markedFor.current = null;
    if (target.unread) markViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id, profile]);
  useEffect(() => {
    if (!waiting) return;
    if (Date.now() - waiting.startedAt > 10 * 60_000) {
      setWaiting(null);
      setTimedOut(true);
      return;
    }
    const seen = seenIds.current;
    if (seen) {
      for (const entry of entries) {
        if (entry.author === "bot" && !seen.has(entry.id)) {
          seenIds.current = null;
          setWaiting(null);
          stickToBottom.current = true;
          markViewed();
          break;
        }
      }
    }
  }, [entries, waiting]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState && AppState.currentState !== "active") return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void thread.refetch();
    }, waiting ? 4000 : 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id, waiting, profile]);
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回列表" hitSlop={8} onPress={onBack} style={{ minHeight: 40, justifyContent: "center", paddingRight: 4 }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 16 }}>‹ 返回</Text>
        </Pressable>
        <BotAvatar id={target.id} name={thread.data?.name ?? target.name} shape={target.avatarShape} color={target.avatarColor} size={26} status={liveTarget?.busy ? "working" : liveTarget?.unread ? "unread" : null} />
        <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700", flex: 1 }}>{thread.data?.name ?? target.name}{profileLabel ? ` · ${profileLabel}` : ""}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="刷新会话" onPress={() => { void thread.refetch(); }} style={{ minHeight: 40, justifyContent: "center" }}>
          <Text style={{ color: thread.isFetching ? theme.colors.foregroundMuted : theme.colors.foregroundMuted, fontSize: 16 }}>{thread.isFetching ? "…" : "↻"}</Text>
        </Pressable>
      </View>
      {statusText ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, paddingLeft: 4 }}>{statusText}</Text> : null}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
        scrollEventThrottle={200}
        onScroll={(event) => {
          const { contentSize, layoutMeasurement, contentOffset } = event.nativeEvent;
          stickToBottom.current = contentSize.height - (layoutMeasurement.height + contentOffset.y) < 60;
        }}
        onContentSizeChange={() => {
          if (stickToBottom.current) scrollRef.current?.scrollToEnd({ animated: false });
        }}
      >
        {thread.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{targetError(thread.error)}</Text> : null}
        {!thread.isFetching && !thread.isError && entries.length === 0 ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>暂无消息，发第一条任务吧。</Text> : null}
        {buildThreadRows(entries, target, byName).map((row) => {
          if (row.kind === "time") {
            return (
              <Text key={row.key} style={{ color: theme.colors.foregroundMuted, fontSize: 10, textAlign: "center" }}>
                {formatAbsolute(row.ts)}
              </Text>
            );
          }
          if (row.kind === "mine") {
            return (
              <View key={row.entry.id} style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                <View
                  style={{
                    backgroundColor: theme.colors.surface1,
                    borderRadius: 12,
                    borderBottomRightRadius: 4,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    maxWidth: "88%",
                    gap: 4,
                  }}
                >
                  <Markdown text={row.entry.content} theme={theme} />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <CopyButton text={row.entry.content} theme={theme} label="复制" />
                  </View>
                </View>
              </View>
            );
          }
          if (row.kind === "peer") {
            const peer = byName(row.name);
            if (!peer) return null;
            return (
              <Pressable
                key={row.key}
                accessibilityRole="button"
                accessibilityLabel={`查看与 ${row.name} 的对话`}
                onPress={() => onOpenPeer(peer)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 16,
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                }}
              >
                <BotAvatar id={peer.id} name={peer.name} shape={peer.avatarShape} color={peer.avatarColor} size={16} />
                <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12 }}>
                  与 {row.name} 的对话{row.count > 1 ? `（${row.count}条）` : ""}
                </Text>
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>›</Text>
              </Pressable>
            );
          }
          const showSpeaker = target.memberCount > 0 || row.label !== target.name;
          if (!showSpeaker) {
            return (
              <View key={row.entry.id} style={{ flexDirection: "row", justifyContent: "flex-start" }}>
                <View
                  style={{
                    backgroundColor: theme.colors.surface1,
                    borderRadius: 12,
                    borderBottomLeftRadius: 4,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    maxWidth: "88%",
                    alignSelf: "flex-start",
                    gap: 4,
                  }}
                >
                  <Markdown text={row.entry.content} theme={theme} />
                  <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                    <CopyButton text={row.entry.content} theme={theme} label="复制" />
                  </View>
                </View>
              </View>
            );
          }
          return (
            <FlatRow
              key={row.entry.id}
              avatarId={row.avatar.id}
              avatarShape={row.avatar.shape}
              avatarColor={row.avatar.color}
              name={row.label}
              nameColor={row.tint}
              content={row.entry.content}
              theme={theme}
            />
          );
        })}
      </ScrollView>
      {send.isError ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: theme.colors.statusDanger, fontSize: 11, flex: 1 }}>{targetError(send.error)}</Text>
          <Pressable accessibilityRole="button" disabled={send.isPending} onPress={() => send.mutate()} style={{ padding: 6 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>重试</Text>
          </Pressable>
        </View>
      ) : null}
      {confirming ? (
        <View style={{ borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 8, gap: 6 }}>
          <Text numberOfLines={2} style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>发送给 {target.name}？Bot 会在它的云电脑上开始处理。</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 16 }}>
            <Pressable accessibilityRole="button" onPress={() => setConfirming(false)}><Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>取消</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={send.isPending} onPress={() => send.mutate()}><Text style={{ color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>{send.isPending ? "发送中…" : "确认发送"}</Text></Pressable>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <TextInput
            accessibilityLabel="消息内容"
            placeholder="给这个 Bot 派任务…"
            placeholderTextColor={theme.colors.foregroundMuted}
            value={draft}
            onChangeText={setDraft}
            editable={!send.isPending}
            multiline
            maxLength={8000}
            style={{ flex: 1, color: theme.colors.foreground, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 10, fontSize: 12, maxHeight: 96 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="发送"
            disabled={!draft.trim() || send.isPending}
            onPress={() => setConfirming(true)}
            style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: "center", opacity: !draft.trim() || send.isPending ? 0.4 : 1 }}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>发送</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

type Screen =
  | { kind: "list" }
  | { kind: "thread"; target: GrokBotTarget }
  | { kind: "pair"; target: GrokBotTarget; peer: GrokBotTarget }
  | { kind: "create" }
  | { kind: "edit"; target: GrokBotTarget };

export function GrokBotSurface({ theme }: { theme: PluginSurfaceProps["theme"] }) {
  const listRpc = useRpc(grokbotList);
  const createRpc = useRpc(grokbotCreate);
  const updateRpc = useRpc(grokbotUpdate);
  const deleteRpc = useRpc(grokbotDelete);
  const profilesRpc = useRpc(grokbotProfiles);
  const saveProfileRpc = useRpc(grokbotSaveProfile);
  const setProfileRpc = useRpc(grokbotSetProfile);
  const delProfileRpc = useRpc(grokbotDeleteProfile);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["ttz-grokbot-list"], queryFn: () => listRpc({}), staleTime: 60_000, retry: 1 });
  const profilesQuery = useQuery({ queryKey: ["ttz-grokbot-profiles"], queryFn: () => profilesRpc({}), staleTime: 60_000, retry: 1 });
  const activeProfile = profilesQuery.data?.active ?? null;
  const profileList = profilesQuery.data?.profiles ?? [];
  const activeLabel = activeProfile ? profileList.find((p) => p.name === activeProfile)?.label ?? activeProfile : null;
  const refreshProfiles = () => { void qc.invalidateQueries({ queryKey: ["ttz-grokbot-profiles"] }); };
  const [userToggledProfiles, setUserToggledProfiles] = useState<boolean | null>(null);
  const [confirmDelProfile, setConfirmDelProfile] = useState<string | null>(null);
  const saveProfileMut = useMutation({
    mutationFn: () => saveProfileRpc({}),
    onSuccess: (data) => {
      qc.setQueryData(["ttz-grokbot-profiles"], data);
      refreshList();
    },
  });
  const setProfileMut = useMutation({
    mutationFn: (name: string | null) => setProfileRpc({ name }),
    onSuccess: (data) => {
      qc.setQueryData(["ttz-grokbot-profiles"], data);
      setConfirmDelProfile(null);
      refreshList();
    },
  });
  const delProfileMut = useMutation({
    mutationFn: (name: string) => delProfileRpc({ name }),
    onSuccess: (data) => {
      qc.setQueryData(["ttz-grokbot-profiles"], data);
      setConfirmDelProfile(null);
      refreshList();
    },
  });
  const profileBusy = saveProfileMut.isPending || setProfileMut.isPending || delProfileMut.isPending;
  const profilesExpanded = userToggledProfiles ?? (profilesQuery.isSuccess && profileList.length === 0);
  const profileError = saveProfileMut.isError ? targetError(saveProfileMut.error)
    : setProfileMut.isError ? targetError(setProfileMut.error)
    : delProfileMut.isError ? targetError(delProfileMut.error)
    : profilesQuery.isError ? targetError(profilesQuery.error) : null;
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const bots = list.data?.bots ?? [];
  const groups = list.data?.groups ?? [];
  const roster = [...bots, ...groups];
  const refreshList = () => { void qc.invalidateQueries({ queryKey: ["ttz-grokbot-list"] }); };
  const createMut = useMutation({
    mutationFn: (data: BotFormData) => createRpc({
      name: data.name,
      description: data.description || undefined,
      title: data.title || undefined,
      avatarShape: data.avatarShape || undefined,
      avatarColor: data.avatarColor || undefined,
    }),
    onSuccess: () => { refreshList(); setScreen({ kind: "list" }); },
  });
  const updateMut = useMutation({
    mutationFn: (args: { target: GrokBotTarget; data: BotFormData }) => {
      const input: { target: string; name?: string; description?: string; title?: string; avatarShape?: string; avatarColor?: string; notify?: "on" | "off"; hidden?: "on" | "off" } = { target: args.target.name };
      if (args.data.name !== args.target.name) input.name = args.data.name;
      if (args.data.description !== (args.target.description ?? "")) input.description = args.data.description;
      if (args.data.title !== (args.target.title ?? "")) input.title = args.data.title;
      if (args.data.avatarShape !== (args.target.avatarShape ?? "")) input.avatarShape = args.data.avatarShape;
      if (args.data.avatarColor !== (args.target.avatarColor ?? "")) input.avatarColor = args.data.avatarColor;
      if (args.data.notify !== (args.target.notify ?? true)) input.notify = args.data.notify ? "on" : "off";
      if (args.data.hidden !== (args.target.hidden ?? false)) input.hidden = args.data.hidden ? "on" : "off";
      return updateRpc(input);
    },
    onSuccess: () => { refreshList(); setScreen({ kind: "list" }); },
  });
  const deleteMut = useMutation({
    mutationFn: (target: GrokBotTarget) => deleteRpc({ target: target.name }),
    onSuccess: () => { refreshList(); setScreen({ kind: "list" }); },
  });
  const back = () => setScreen({ kind: "list" });
  if (screen.kind === "thread") {
    return <View style={{ flex: 1, backgroundColor: theme.colors.surface0, padding: 12 }}><ThreadView target={screen.target} targets={roster} theme={theme} onBack={back} onOpenPeer={(peer) => setScreen({ kind: "pair", target: screen.target, peer })} profile={activeProfile} profileLabel={activeLabel} /></View>;
  }
  if (screen.kind === "pair") {
    return <View style={{ flex: 1, backgroundColor: theme.colors.surface0, padding: 12 }}><PairPanel target={screen.target} peerName={screen.peer.name} targets={roster} theme={theme} onBack={() => setScreen({ kind: "thread", target: screen.target })} profile={activeProfile} profileLabel={activeLabel} /></View>;
  }
  if (screen.kind === "create") {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12, maxWidth: 680, width: "100%", alignSelf: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回列表" hitSlop={8} onPress={back} style={{ minHeight: 40, justifyContent: "center", paddingRight: 4 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 16 }}>‹ 返回</Text>
            </Pressable>
            <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700" }}>添加机器人</Text>
          </View>
          <BotForm
            initial={null}
            theme={theme}
            saving={createMut.isPending}
            error={createMut.isError ? targetError(createMut.error) : null}
            onSave={(data) => createMut.mutate(data)}
          />
        </ScrollView>
      </View>
    );
  }
  if (screen.kind === "edit") {
    const fresh = roster.find((item) => item.id === screen.target.id) ?? screen.target;
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
        <ScrollView contentContainerStyle={{ padding: 12, gap: 12, maxWidth: 680, width: "100%", alignSelf: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回列表" hitSlop={8} onPress={back} style={{ minHeight: 40, justifyContent: "center", paddingRight: 4 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 16 }}>‹ 返回</Text>
            </Pressable>
            <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700", flex: 1 }}>编辑 {fresh.name}</Text>
          </View>
          <BotForm
            key={fresh.id}
            initial={fresh}
            theme={theme}
            saving={updateMut.isPending}
            error={updateMut.isError ? targetError(updateMut.error) : deleteMut.isError ? targetError(deleteMut.error) : null}
            onSave={(data) => updateMut.mutate({ target: fresh, data })}
            onDelete={() => deleteMut.mutate(fresh)}
            deleting={deleteMut.isPending}
          />
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 4, maxWidth: 680, width: "100%", alignSelf: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Pressable accessibilityRole="button" accessibilityLabel="切换登录身份" accessibilityState={{ expanded: profilesExpanded }} onPress={() => setUserToggledProfiles(!profilesExpanded)} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40, paddingRight: 8 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>{activeLabel ?? "本机登录"}</Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{profilesExpanded ? "▴" : "▾"}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="刷新列表" disabled={list.isFetching} onPress={() => { void list.refetch(); }} style={{ minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 20 }}>{list.isFetching ? "…" : "↻"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="添加机器人" onPress={() => setScreen({ kind: "create" })} style={{ minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 22 }}>＋</Text>
          </Pressable>
        </View>
        {profilesExpanded ? (
          <View style={{ gap: 4, paddingBottom: 8 }}>
            <Pressable
              accessibilityRole="button"
              disabled={profileBusy || activeProfile === null}
              onPress={() => setProfileMut.mutate(null)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40, opacity: profileBusy ? 0.5 : 1 }}
            >
              <Text style={{ color: activeProfile === null ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, width: 14 }}>{activeProfile === null ? "✓" : ""}</Text>
              <Text style={{ color: theme.colors.foreground, fontSize: 12, flex: 1 }}>本机登录</Text>
            </Pressable>
            {profileList.map((p) => (
              <View key={p.name}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 40 }}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={profileBusy}
                    onPress={() => setProfileMut.mutate(p.name)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, opacity: profileBusy ? 0.5 : 1 }}
                  >
                    <Text style={{ color: activeProfile === p.name ? theme.colors.foreground : theme.colors.foregroundMuted, fontSize: 12, width: 14 }}>{activeProfile === p.name ? "✓" : ""}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{p.label}</Text>
                      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>{p.name}</Text>
                    </View>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={profileBusy} onPress={() => setConfirmDelProfile(p.name)} style={{ padding: 8 }}>
                    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>删除</Text>
                  </Pressable>
                </View>
                {confirmDelProfile === p.name ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 22, paddingBottom: 6 }}>
                    <Text style={{ color: theme.colors.statusDanger, fontSize: 11, flex: 1 }}>删除该身份存档？账号本身不受影响。</Text>
                    <Pressable accessibilityRole="button" onPress={() => setConfirmDelProfile(null)} style={{ padding: 6 }}>
                      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>取消</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" disabled={delProfileMut.isPending} onPress={() => delProfileMut.mutate(p.name)} style={{ padding: 6 }}>
                      <Text style={{ color: theme.colors.statusDanger, fontSize: 11, fontWeight: "600" }}>{delProfileMut.isPending ? "删除中…" : "确认删除"}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            {(() => {
              const savedName = profilesQuery.data?.liveSavedAs ?? null;
              const hasLive = profilesQuery.data?.hasLive ?? true;
              if (!profilesQuery.isSuccess) return null;
              if (!hasLive) return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>本机未登录 Grok Bot，先在 App 里登录要存的号。</Text>;
              if (savedName) {
                const savedLabel = profileList.find((p) => p.name === savedName)?.label ?? savedName;
                return <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>当前登录已存为 {savedLabel} ✓</Text>;
              }
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="保存当前登录"
                  disabled={profileBusy}
                  onPress={() => saveProfileMut.mutate()}
                  style={{ backgroundColor: theme.colors.surface1, borderRadius: 8, minHeight: 44, alignItems: "center", justifyContent: "center", opacity: profileBusy ? 0.4 : 1, marginTop: 6 }}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>{saveProfileMut.isPending ? "保存中…" : "保存当前登录"}</Text>
                </Pressable>
              );
            })()}
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>先在 Grok Bot App 登录好要存的号，再点存档。身份失效时回 App 重登后重新存档覆盖。</Text>
            {profileError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{profileError}</Text> : null}
          </View>
        ) : null}
        {list.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{targetError(list.error)}</Text> : null}
        {bots.map((bot) => <TargetRow key={bot.id} target={bot} theme={theme} isGroup={false} onPress={() => setScreen({ kind: "thread", target: bot })} onEdit={() => setScreen({ kind: "edit", target: bot })} />)}
        {groups.map((group) => <TargetRow key={group.id} target={group} theme={theme} isGroup onPress={() => setScreen({ kind: "thread", target: group })} onEdit={() => setScreen({ kind: "edit", target: group })} />)}
        {!list.isFetching && bots.length === 0 && groups.length === 0 && !list.isError ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>还没有机器人，点右上角 ＋ 创建第一个。</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export function GrokBotPanel(props: PluginAgentPanelProps | PluginWorkspacePanelProps) {
  return <GrokBotSurface theme={props.theme} />;
}

export function GrokBotAgentPanel(props: PluginAgentPanelProps) {
  return <GrokBotPanel {...props} />;
}
