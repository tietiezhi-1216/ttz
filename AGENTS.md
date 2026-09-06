# 铁铁汁 — Agent 安装

复制下面整段给负责装环境的 Agent。不要打印 `auth.json` 或 token。

---

安装 https://github.com/tietiezhi-1216/ttz

1. `pi install git:github.com/tietiezhi-1216/ttz`
2. 从 `~/.pi/agent/settings.json` 的 `extensions` 去掉 `pi-multi-account` 和旧的 `Project/tietiezhi/pi`
3. `paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo`（需 `pluginsEnabled: true`）
4. 若已有旧插件 `tietiezhi` / `pi-quota-pills`：`paseo plugin remove tietiezhi`
5. 新开 Pi 会话后 `/` 里应有 `/ttz`，没有 `/multi-account`
6. **不要**让插件对所有 agent 调用 `send("/ttz ...")`
7. 侧栏标题必须是「铁铁汁」

切号：当前会话 `/ttz switch hotmail`；侧栏「选用」只写 `~/.paseo/ttz.json` 的 `preferredId`。
