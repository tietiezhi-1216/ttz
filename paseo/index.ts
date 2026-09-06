import type { PluginContext } from "@getpaseo/plugin";
import { contributePills, SettingsSurface } from "./ui.client";
import {
  handleGetQuota,
  handleImportAuth,
  handleLogin,
  handleRefreshQuota,
  handleSwitchAccount,
  saveLoginCredentials,
  handleAddGoKey,
} from "./store.server";
import { getQuota, importAuth, loginAccount, refreshQuota, switchAccount, addGoKey } from "./shared";

import { startLogin, loginStatus, submitLogin, cancelLogin } from "./auth.shared";
import { beginLogin, getLogin, submitCode, cancel, disposeLogin } from "./auth-flow.server";

import { checkUpdates } from "./update.shared";
import { handleCheckUpdates } from "./update.server";

export default function contribute(plugin: PluginContext) {
  plugin.handle(checkUpdates, handleCheckUpdates);
  plugin.handle(addGoKey, handleAddGoKey);
  plugin.handle(startLogin, ({ family }) => beginLogin(family, saveLoginCredentials));
  plugin.handle(loginStatus, ({ id }) => getLogin(id));
  plugin.handle(submitLogin, ({ id, code }) => submitCode(id, code));
  plugin.handle(cancelLogin, ({ id }) => cancel(id));
  plugin.handle(getQuota, handleGetQuota);
  plugin.handle(refreshQuota, handleRefreshQuota);
  plugin.handle(importAuth, handleImportAuth);
  plugin.handle(loginAccount, handleLogin);
  plugin.handle(switchAccount, handleSwitchAccount);

  plugin.addSurface("ttz-settings", SettingsSurface);
  plugin.addSidebarItem({
    id: "ttz-settings",
    title: "铁铁汁",
    icon: "Gauge",
    surface: "ttz-settings",
  });
  plugin.addClientSide(contributePills);
  return () => { disposeLogin(); };
}
