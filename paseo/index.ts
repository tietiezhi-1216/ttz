import type { PluginContext } from "@getpaseo/plugin";
import { contributePills, SettingsSurface } from "./ui.client";
import {
  handleGetPrefs,
  handleGetQuota,
  handleRefreshQuota,
  handleSetPrefs,
  handleSwitchAccount,
} from "./store.server";
import { getPrefs, getQuota, refreshQuota, setPrefs, switchAccount } from "./shared";

export default function contribute(plugin: PluginContext) {
  plugin.handle(getQuota, handleGetQuota);
  plugin.handle(refreshQuota, handleRefreshQuota);
  plugin.handle(getPrefs, handleGetPrefs);
  plugin.handle(setPrefs, handleSetPrefs);
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
