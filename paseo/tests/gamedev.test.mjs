import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canArchiveAgent, isGameId, groupPendingBranches, parseLsRemoteRefs, resolveLocalWorker, vendorCandidates } from "../gamedev.shared.ts";

describe("gamedev shared helpers", () => {
  it("recognises seven-digit game agent names", () => {
    assert.equal(isGameId("6000543"), true);
    assert.equal(isGameId("8000109"), true);
    assert.equal(isGameId("游戏开发"), false);
    assert.equal(isGameId("jili-1"), false);
    assert.equal(isGameId(""), false);
  });

  it("parses ls-remote heads output", () => {
    const raw = [
      "ec5043242\trefs/heads/main",
      "9f8a1b2c\trefs/heads/automation/game/6000543-20260906T150000Z",
      "malformed-line-without-tab",
    ].join("\n");
    assert.deepEqual(parseLsRemoteRefs(raw), [
      "main",
      "automation/game/6000543-20260906T150000Z",
    ]);
  });

  it("resolves the local worker by IP", () => {
    const workers = [{ id: "mac81", host: "192.168.24.81:6767" }, { id: "mac82", host: "192.168.24.82:6767" }];
    assert.equal(resolveLocalWorker(["192.168.24.82", "127.0.0.1"], workers), 1);
    assert.equal(resolveLocalWorker(["192.168.24.80"], workers), -1);
    assert.equal(resolveLocalWorker([], workers), -1);
  });

  it("only numeric game agents are archivable", () => {
    assert.equal(canArchiveAgent("6000543"), true);
    assert.equal(canArchiveAgent("游戏开发"), false);
    assert.equal(canArchiveAgent("JILI"), false);
  });

  it("derives vendor candidates from internal IDs", () => {
    assert.deepEqual(vendorCandidates("6000543"), ["543"]);
    assert.deepEqual(vendorCandidates("8000109"), ["109"]);
    assert.deepEqual(vendorCandidates("6000103"), ["103"]);
    assert.deepEqual(vendorCandidates("6000002"), ["2"]);
  });

  it("groups automation branches per game", () => {
    const grouped = groupPendingBranches([
      "automation/game/6000543-20260904T113608Z",
      "automation/game/6000543-20260905T000000Z",
      "automation/game/6000103-20260906T000000Z",
      "main",
    ]);
    assert.equal(grouped.get("6000543"), 2);
    assert.equal(grouped.get("6000103"), 1);
    assert.equal(grouped.has("main"), false);
  });
});
