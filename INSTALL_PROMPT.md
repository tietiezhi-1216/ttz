# 发给同事的 Agent 安装提示词

复制下面整段给同事的 coding agent：

```text
请帮我安装「铁铁汁 / ttz」Paseo 插件。

仓库：https://github.com/tietiezhi-1216/ttz
插件子目录：paseo/
运行 ID：ttz

先读仓库 README.md、AGENTS.md，检查安装目标和环境，再执行：
1. 确认我要安装在哪台 Paseo daemon 主机；不清楚先问，不要默认把手机连接的远程主机当成本机。
2. 检查 Paseo 版本及主机 Node.js/npm/Git。此版本验证了 Paseo 0.7.2 + Node.js 24 + macOS。遇到 0.8 或其他未验证环境，说明兼容性限制，不强行安装。
3. 插件是可信、非沙箱代码，可访问主机文件、进程、网络及 Pi 凭据。向我说明风险并确认信任；如果 pluginsEnabled 为 false/缺失，取得明确同意后才能启用。
4. 不读取或展示现有凭据。不安装 Pi 扩展，不删除已有 Pi 扩展，不发送 /ttz 命令。
5. 若已有 ttz，先查看它是本地源码、跟踪分支还是固定版本，并检查是否存在本地修改；不要直接覆盖。
6. 默认跟踪 main（便于后续更新）：
   paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo --id ttz --ref main
   如果我要求固定版本，改用 --ref v2.2.0。
   远程目标给相关命令添加 --host <目标主机>，构建依赖会在那个主机安装。
7. 验证 paseo plugin ls 中 ttz 为 running 且无错误，查看必要的插件日志但不要打印敏感信息。
8. 提醒我刷新客户端，在侧栏「铁铁汁」的 ⋯ 菜单用设备码登录 Codex/Grok，或在密钥输入框添加 OpenCode Go。不要让我把 API Key、Token、设备码或回调地址发到聊天里。
9. 不替我点击切换账号或测试重启。切换会影响同一主机的其他对话，必须单独确认。
10. 告诉我以后可在 ⋯ → 检查更新查看版本；跟踪 main 的 Git 安装用 paseo plugin update ttz 更新。固定标签要重新安装新标签。本地源码安装不能直接使用此更新方式。

完成后只报告：安装主机、版本/分支、插件状态、如何打开和更新。遇到错误保留原配置，报告原因，不自动重启整个 daemon。
```
