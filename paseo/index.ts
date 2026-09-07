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
import { grokbotList, grokbotSend, grokbotThread, grokbotCreate, grokbotUpdate, grokbotDelete, grokbotMarkRead, grokbotProfiles, grokbotSaveProfile, grokbotSetProfile, grokbotDeleteProfile } from "./grokbot.shared";
import { handleGrokbotList, handleGrokbotSend, handleGrokbotThread, handleGrokbotCreate, handleGrokbotUpdate, handleGrokbotDelete, handleGrokbotMarkRead, handleGrokbotProfiles, handleGrokbotSaveProfile, handleGrokbotSetProfile, handleGrokbotDeleteProfile } from "./grokbot.server";
import { GrokBotPanel } from "./grokbot.client";
import { gamedevArchive, gamedevDetail, gamedevDispatch, gamedevList, gamedevThread } from "./gamedev.shared";
import { handleGamedevArchive, handleGamedevDetail, handleGamedevDispatch, handleGamedevList, handleGamedevThread } from "./gamedev.server";
import { GameDevSurface } from "./gamedev.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(checkUpdates, handleCheckUpdates);
  plugin.handle(grokbotList, handleGrokbotList);
  plugin.handle(grokbotThread, handleGrokbotThread);
  plugin.handle(grokbotSend, handleGrokbotSend);
  plugin.handle(grokbotCreate, handleGrokbotCreate);
  plugin.handle(grokbotUpdate, handleGrokbotUpdate);
  plugin.handle(grokbotDelete, handleGrokbotDelete);
  plugin.handle(grokbotMarkRead, handleGrokbotMarkRead);
  plugin.handle(grokbotProfiles, handleGrokbotProfiles);
  plugin.handle(grokbotSaveProfile, handleGrokbotSaveProfile);
  plugin.handle(grokbotSetProfile, handleGrokbotSetProfile);
  plugin.handle(grokbotDeleteProfile, handleGrokbotDeleteProfile);
  plugin.handle(gamedevList, ({ query }) => handleGamedevList({ query }));
  plugin.handle(gamedevDetail, ({ gameId, host, shortId }) => handleGamedevDetail({ gameId, host, shortId }));
  plugin.handle(gamedevThread, ({ shortId, host, tail }) => handleGamedevThread({ shortId, host, tail }));
  plugin.handle(gamedevArchive, ({ shortId, host }) => handleGamedevArchive({ shortId, host }));
  plugin.handle(gamedevDispatch, ({ text }) => handleGamedevDispatch({ text }));
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
  plugin.addWorkspacePanel({
    id: "ttz-grokbot",
    title: "Grok Bot",
    icon: "Bot",
    context: "workspace",
    locations: ["workspace", "explorer"],
    Component: GrokBotPanel,
  });
  plugin.addCommandCenterItem({
    id: "open-grokbot",
    title: "Grok Bot",
    icon: "Bot",
    context: "workspace",
    onSelect({ openPanel }) {
      openPanel("ttz-grokbot");
    },
  });
  plugin.addSurface("ttz-gamedev", GameDevSurface);
  plugin.addSidebarItem({
    id: "ttz-gamedev",
    title: "游戏开发",
    icon: "Gamepad2",
    surface: "ttz-gamedev",
  });
  plugin.addClientSide(contributePills);
  return () => { disposeLogin(); };
}
