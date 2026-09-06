# 铁铁汁 / ttz

只有 **Paseo 插件**。没有 Pi 扩展，不会往对话里发 `/ttz`。

侧栏「铁铁汁」：

- **导入 auth.json**：把本机 `~/.pi/agent/auth.json` 里的 Codex / Grok 存进 `~/.paseo/ttz.json`
- **登录 Codex / 登录 Grok**：打开终端跑 `pi`，你自己 `/login`，完了再点导入
- **选用并重启**：把该号写回 Pi 正在用的槽（`openai-codex` 或 `xai`），然后重启 Paseo daemon

有什么号就显示什么，没有 Codex/Grok 总开关。

切号会断开当前所有对话。Token 只写在本机 0600 文件里，不进 git。
