# 铁铁汁 — Agent 安装

安装 https://github.com/tietiezhi-1216/ttz 的 **paseo/** 插件。不要装 Pi 扩展，不要 `send("/ttz")`。

```bash
paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo
```

从 `~/.pi/agent/settings.json` 的 `extensions` 去掉 ttz/pi、pi-multi-account。

侧栏标题必须是「铁铁汁」。面板有：导入 auth.json、登录 Codex、登录 Grok、选用并重启。

不要打印 auth.json / token。
