import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { useRpc, type PluginSurfaceProps } from "@getpaseo/plugin";
import { useQuery } from "@tanstack/react-query";
import { checkUpdates } from "./update.shared";
import { REPOSITORY, VERSION } from "./version";

export function UpdatePanel({ theme }: { theme: PluginSurfaceProps["theme"] }) {
  const check = useRpc(checkUpdates);
  const query = useQuery({ queryKey: ["ttz-update"], queryFn: () => check({}), staleTime: 10 * 60_000, retry: false });
  return <View style={{ padding: 8, gap: 8 }}>
    <Text style={{ color: theme.colors.foreground, fontSize: 12 }}>当前 v{VERSION}{query.data ? ` · 最新 v${query.data.latest}` : ""}</Text>
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{query.isPending ? "正在检查更新…" : query.isError ? "检查失败，可到 GitHub 查看版本。" : query.data?.available ? "有新版本。请由 Paseo 插件管理执行更新。" : "当前没有更新的正式版本。"}</Text>
    <Text selectable style={{ color: theme.colors.foreground, fontSize: 12 }}>paseo plugin update ttz</Text>
    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>适用于跟踪 main 的 Git 安装。固定版本需重新安装新标签；本地源码安装使用 git pull 后重载。更新不会主动清空账号数据。</Text>
    <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(`${REPOSITORY}/releases`).catch(() => {}); }} style={{ paddingVertical: 8 }}><Text style={{ color: theme.colors.foreground, fontSize: 12 }}>查看发布记录 ↗</Text></Pressable>
    <Text selectable style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>{REPOSITORY}/releases</Text>
  </View>;
}
