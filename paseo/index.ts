import type { PluginContext } from "@getpaseo/plugin";
import { contributePills, SettingsSurface } from "./ui.client";
import {
  handleGetQuota,
  handleImportAuth,
  handleLogin,
  handleRefreshQuota,
  handleSwitchAccount,
} from "./store.server";
import { getQuota, importAuth, loginAccount, refreshQuota, switchAccount } from "./shared";

export default function contribute(plugin: PluginContext) {
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
  return () => {};
}
