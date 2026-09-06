# 铁铁汁 — Agent 协作与安装

本仓库只有 Paseo 插件，入口在 `paseo/`。安装提示词见 `INSTALL_PROMPT.md`，功能、风险和更新方式见 `README.md`。

## 安装边界
- 安装源：`git:github.com/tietiezhi-1216/ttz:paseo`；运行 ID 固定 `ttz`。
- 不安装 Pi 扩展，不发送 `/ttz`，不擅自删除使用者已有的 Pi 扩展。
- 插件未启用时必须先说明非沙箱代码风险并取得明确同意，再开启。
- 远程安装前确认目标主机，不能误改本机配置。
- 不输出 Token、API Key、授权回调内容或整个认证文件。
- 不为了测试切换账号或重启整个 daemon。

## 开发和发布
- 用 `npm ci --ignore-scripts`、`npm run typecheck`、`npm test` 验证 `paseo/`。
- 凭据只在服务端处理，不随源码、测试数据、Release 或日志发布。
- 更新版本时同步根包、插件包、锁文件与 `paseo/version.ts`。
- 保留 Git 安装的 build 准备步骤；不要假设 Paseo 会自动安装依赖。
- 发布到 GitHub Release，不执行 npm publish。跟踪 main 可用 `paseo plugin update ttz`，标签安装保持固定版本。
