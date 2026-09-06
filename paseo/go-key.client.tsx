import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addGoKey } from "./shared";

export function GoKeyPanel({ theme, onClose }: { theme: PluginSurfaceProps["theme"]; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const rpc = useRpc(addGoKey);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => rpc({ key: key.trim(), label: label.trim() }),
    onSuccess: (data) => { setKey(""); qc.setQueryData(["ttz-quota"], data); },
  });
  const message = String(save.error?.message ?? "");
  const inputStyle = { color: theme.colors.foreground, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 10, fontSize: 12 };
  return <View style={{ paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderColor: theme.colors.border }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>添加 OpenCode Go</Text>
    {!save.isSuccess ? <>
      <TextInput accessibilityLabel="账号备注" placeholder="备注（可选）" placeholderTextColor={theme.colors.foregroundMuted} value={label} onChangeText={setLabel} editable={!save.isPending} maxLength={60} style={inputStyle} />
      <TextInput accessibilityLabel="OpenCode Go API Key" placeholder="粘贴 API Key" placeholderTextColor={theme.colors.foregroundMuted} value={key} onChangeText={setKey} editable={!save.isPending} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={4096} style={inputStyle} />
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>验证成功后保存在此主机，不覆盖已有账号或自动切换。</Text>
    </> : <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>已验证并保存。</Text>}
    {save.isError ? <Text style={{ color: theme.colors.statusDanger, fontSize: 11 }}>{message.includes("GO_KEY_INVALID") ? "Key 无效，请检查后重试" : message.includes("GO_SUBSCRIPTION_REQUIRED") ? "此 Key 没有 OpenCode Go 订阅权限" : "验证或保存失败，请检查网络后重试"}</Text> : null}
    <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
      <Pressable accessibilityRole="button" disabled={save.isPending} onPress={() => { setKey(""); onClose(); }} style={{ padding: 10 }}><Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{save.isSuccess ? "完成" : "取消"}</Text></Pressable>
      {!save.isSuccess ? <Pressable accessibilityRole="button" disabled={!key.trim() || save.isPending} onPress={() => save.mutate()} style={{ padding: 10, opacity: !key.trim() || save.isPending ? 0.4 : 1 }}><Text style={{ color: theme.colors.foreground, fontSize: 12 }}>{save.isPending ? "验证中…" : "验证并保存"}</Text></Pressable> : null}
    </View>
  </View>;
}
