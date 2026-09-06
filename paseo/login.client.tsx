import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { startLogin, loginStatus, submitLogin, cancelLogin, type LoginState } from "./auth.shared";

export function LoginPanel({ family, theme, onClose }: { family: "codex" | "xai"; theme: PluginSurfaceProps["theme"]; onClose: () => void }) {
  const start = useRpc(startLogin);
  const status = useRpc(loginStatus);
  const submit = useRpc(submitLogin);
  const cancel = useRpc(cancelLogin);
  const qc = useQueryClient();
  const [initial, setInitial] = useState<LoginState | null>(null);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const completed = useRef(false);
  useEffect(() => {
    let alive = true;
    void start({ family }).then((s) => { if (alive) setInitial(s); }).catch(() => { if (alive) setLocalError("无法启动授权，请关闭后重试"); });
    return () => { alive = false; };
  }, [family, start]);
  const query = useQuery({
    queryKey: ["ttz-login", initial?.id],
    queryFn: () => status({ id: initial!.id }),
    enabled: !!initial,
    refetchInterval: (q) => q.state.data && ["done", "error", "cancelled"].includes(q.state.data.status) ? false : 1000,
    retry: 1,
  });
  const state = query.data ?? initial;
  useEffect(() => {
    if (state?.status === "done" && !completed.current) {
      completed.current = true;
      setCode("");
      void qc.invalidateQueries({ queryKey: ["ttz-quota"] });
    }
  }, [state?.status, qc]);
  const submitMut = useMutation({
    mutationFn: () => submit({ id: initial!.id, code: code.trim() }),
    onSuccess: (s) => { setCode(""); qc.setQueryData(["ttz-login", s.id], s); },
    onError: () => setLocalError("回调提交失败，请检查授权是否仍有效"),
  });
  const close = async () => {
    if (initial) {
      try { await cancel({ id: initial.id }); } catch { /* session may already have expired */ }
      qc.removeQueries({ queryKey: ["ttz-login", initial.id] });
    }
    setCode(""); onClose();
  };
  const button = (label: string, onPress: () => void, disabled = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ paddingHorizontal: 10, minHeight: 38, justifyContent: "center", opacity: disabled ? 0.4 : 1 }}><Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{label}</Text></Pressable>;
  return <View style={{ borderBottomWidth: 1, borderColor: theme.colors.border, paddingVertical: 12, gap: 10 }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{family === "codex" ? "Codex" : "Grok"} 授权</Text>
    {state?.url ? <>
      <Text selectable style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>打开官方验证页，输入下方设备码；此面板会自动等待授权完成。</Text>
      {state.userCode ? <Text selectable style={{ color: theme.colors.foreground, fontSize: 22, fontWeight: "600", letterSpacing: 2 }}>{state.userCode}</Text> : null}
      {button("打开验证页", () => { void Linking.openURL(state.url!).catch(() => setLocalError("无法自动打开，请复制下方链接到浏览器")); })}
      <Text selectable style={{ color: theme.colors.foreground, fontSize: 11 }}>{state.url}</Text>
      {family === "codex" ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>若 OpenAI 提示未启用设备码授权，请先在账户安全设置中启用。</Text> : null}
    </> : null}
    {state?.acceptsCode ? <>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>在其他设备授权后，若跳到 localhost 无法打开，请把地址栏的完整回调链接粘贴在这里。不要把它发到聊天中。</Text>
      <TextInput accessibilityLabel="授权回调地址" placeholder="粘贴完整回调链接" placeholderTextColor={theme.colors.foregroundMuted} value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} secureTextEntry style={{ color: theme.colors.foreground, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 10, fontSize: 12 }} />
      {button(submitMut.isPending ? "提交中…" : "完成授权", () => submitMut.mutate(), !code.trim() || submitMut.isPending)}
    </> : null}
    {state?.status === "done" ? <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>账号已保存，刷新额度即可查看。</Text> : null}
    {!state || state.status === "starting" || state.status === "saving" ? <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{state?.status === "saving" ? "正在验证并保存…" : "正在准备授权链接…"}</Text> : null}
    {localError || state?.error || query.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{localError ?? state?.error ?? "授权状态读取失败，请关闭后重试"}</Text> : null}
    {button(state?.status === "done" ? "完成" : "取消登录", () => { void close(); })}
  </View>;
}
