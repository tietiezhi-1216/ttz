# 铁铁汁 / ttz

自己维护的一套：Paseo 侧栏看额度、记要哪个号；Pi 扩展只在**当前会话**执行 `/ttz switch`。  
**不会**往每个窗口自动发命令。

| 部分 | 路径 | 作用 |
|---|---|---|
| Paseo 插件 | `paseo/` | 侧栏「铁铁汁」，账号与额度存在 `~/.paseo/ttz.json` |
| Pi 扩展 | `pi/` | `/ttz status` · `/ttz switch hotmail` |

OAuth 仍在 `~/.pi/agent/auth.json`（Pi 登录槽）。插件只存名单、短名、额度和「记下的号」，不存 token。

## 安装

```bash
pi install git:github.com/tietiezhi-1216/ttz
paseo plugin install git:github.com/tietiezhi-1216/ttz:paseo
```

Pi `settings.json` 的 `extensions` 不要再指向 `pi-multi-account`。

当前对话立刻换号：在该 Pi 输入框发 `/ttz switch hotmail`。侧栏「选用」只记偏好，新开的 Pi 会读。
