# 铁铁汁 · ttz

Paseo 账号与额度插件，支持 **Codex、Grok、OpenCode Go**。当前版本 **v2.2.0**。

**只安装到 Paseo，不安装 Pi 扩展，不注册 `/ttz` 命令。**

## 安装

要求：Paseo **0.7.2**（0.8 尚未验证）、主机有 Node.js **24+**、npm、Git 和 Pi。当前端到端验证平台为 macOS；Linux/Windows 的安装、CLI 重启和文件权限行为尚未完整验证。

> 插件是可信、非沙箱代码，可以访问运行 Paseo 的主机上的文件、进程和网络。请先审阅并确认信任。下面命令也信任依赖及后续更新。

先在目标主机的 **Settings → Plugins** 启用插件，然后：

```bash
paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo --id ttz --ref main
paseo plugin ls
```

必须保留运行 ID `ttz`，用于定位安装目录中的 OAuth 依赖。`paseo/` 是插件子目录；不要安装仓库根目录。

Git 安装会按清单执行 `npm ci --ignore-scripts` 和类型检查。失败时不要手动跳过验证。

需要固定版本时：

```bash
paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo --id ttz --ref v2.2.0
```

远程安装请给 Paseo CLI 命令添加 `--host <目标主机>`，操作发生在该主机，不是在手机上。安装用 Agent 提示词见 [INSTALL_PROMPT.md](INSTALL_PROMPT.md)。

## 功能与使用

- 侧栏「铁铁汁」显示分平台账号列表、圆形进度和重置时间；0% 未使用，100% 已用完。
- 胶囊跟随当前模型的 provider。明确账号槽位的模型显示该账号；普通 Codex/Grok/Go provider 显示平台默认账号，**不保证识别第三方自动轮换扩展实际使用的账号**。
- 默认账号以深色行背景显示。点击其他账号后需要确认才切换。
- **切换会写入 Pi 的默认认证槽并重启当前主机的 Paseo daemon，可能中断所有运行中的对话。** 不要在重要任务中途切换。
- Codex / Grok：`⋯ → 登录`，设备码授权，在官方验证页面输入短码，插件等待完成。OpenAI 可能要求在账户安全设置中开启设备码授权。
- OpenCode Go：`⋯ → 添加 OpenCode Go Key`，输入密钥和可选备注；验证通过后保存。重复 Key 不重复添加，不主动切换已有默认账号。
- Go 显示 5 小时、周、月三个窗口；胶囊使用百分比最高的窗口，而不是三者相加。
- `⋯ → 从本机导入账号` 读取主机上的 Pi `auth.json`，不是上传文件；先备份，同名槽位的凭据会覆盖，请确认。
- 本地缓存轮询 60 秒；已挂载的面板在应用前台时每 5 分钟请求额度，打开时过期缓存也会刷新。手动刷新有 30 秒冷却，同一插件实例内并发刷新合并。
- OAuth 续期优先复用 Pi 中可确认属于同一账号的更新凭据，再尝试 refresh token。失败显示错误，不冒用旧额度。
- 目前没有账号文件上传、加密导出或会员到期查询。

## 更新与回滚

`⋯ → 检查更新` 查询公开 GitHub Release（缓存 10 分钟），只显示版本和操作方式，**不会自动下载执行代码**。

跟踪 `main` 的 Git 安装：

```bash
paseo plugin status ttz
paseo plugin update ttz
paseo plugin ls
```

更新可能中断正在进行的设备码授权，建议授权完成后再更新。正常更新不主动删除账号数据。

标签/提交是固定版本，不会自动跟随新 Release；升级时重新安装新标签。回滚示例：

```bash
paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo --id ttz --ref v2.2.0
```

本地源码安装不受 `plugin update` 管理；先 `git pull --ff-only`，再进入 `paseo/` 执行 `npm ci --ignore-scripts`、`npm run typecheck`、`npm test`，最后 `paseo plugin reload ttz`。

**不要用 `paseo daemon restart` 来加载插件更新。** Release 历史见 [GitHub Releases](https://github.com/tietiezhi-1216/ttz/releases)。

## 数据与隐私

当前使用默认主目录路径（自定义 Paseo/Pi 数据目录尚未支持）：

- `~/.paseo/ttz.json`：插件账号、凭据和额度缓存。
- `~/.pi/agent/auth.json`：Pi 账号凭据；新增登录、Key 和续期可能写入，切换写入默认槽。
- 同目录下的 `.bak-*`：敏感备份，勿上传仓库或发送聊天。

凭据是**本机明文保存**，macOS/Linux 文件权限设为 0600；不是加密保险库。备份也含密钥，应自行妥善清理。Windows 不应仅依赖 POSIX 权限位保护文件。

插件向对应平台的官方接口发送认证信息以登录/查询额度；检查更新只请求 GitHub 的公开版本信息，不附带平台凭据。不提供共享账号服务，不附带开发者账号或密钥。

## 开发与发布

```bash
cd paseo
npm ci --ignore-scripts
npm run typecheck
npm test
paseo plugin reload ttz
```

OAuth 依赖使用 Pi AI 的内部实现，因此固定 `@earendil-works/pi-ai@0.84.4`；升级依赖前需重新验证设备码、续期和安装目录解析。

发布时同步根目录 `package.json`、`paseo/package.json`、锁文件和 `paseo/version.ts`，通过检查后提交，创建 `vX.Y.Z` 标签和 GitHub Release。本仓库通过 Git 分发，不发布 npm 包。
