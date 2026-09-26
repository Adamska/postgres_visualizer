import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newProfile } from "@/core/connection/url";
import { shortcutFor } from "@/hooks/useShortcuts";
import { installBackend } from "@/lib/backend";
import { createMockBackend, USERS, type MockBackend } from "@/test/mockBackend";

import { COMMAND_IDS, isCommandId, runCommand } from "./actions/commands";
import { connect } from "./actions/connections";
import { clearPasswordCache, saveProfile } from "./actions/profiles";
import { loadTable } from "./actions/tableTab";
import { openTable } from "./actions/workspace";
import { getState, resetStore } from "./store";

let backend: MockBackend;
let restore: () => void;

beforeEach(() => {
  resetStore();
  clearPasswordCache();
  backend = createMockBackend();
  restore = installBackend(backend);
});

afterEach(() => restore());

describe("commands", () => {
  it("recognises ids and maps shortcuts", () => {
    expect(isCommandId("settings")).toBe(true);
    expect(isCommandId("nope")).toBe(false);
    expect(COMMAND_IDS).toContain("query.run");
    expect(shortcutFor({ key: ",", shiftKey: false, altKey: false }, false)).toBe("settings");
    expect(shortcutFor({ key: "N", shiftKey: true, altKey: false }, false)).toBe("connection.new");
    expect(shortcutFor({ key: "n", shiftKey: false, altKey: true }, false)).toBe("table.addRow");
    expect(shortcutFor({ key: "Enter", shiftKey: false, altKey: false }, true)).toBeNull();
    expect(shortcutFor({ key: "Enter", shiftKey: true, altKey: false }, false)).toBe("query.runAll");
    expect(shortcutFor({ key: "x", shiftKey: false, altKey: false }, false)).toBeNull();
  });

  it("opens dialogs and toggles panels without a connection", () => {
    expect(runCommand("settings")).toBe(true);
    expect(getState().dialog).toEqual({ kind: "settings" });
    expect(runCommand("connection.new")).toBe(true);
    expect(getState().dialog).toEqual({ kind: "connection", profileId: null });
    expect(runCommand("view.sidebar")).toBe(true);
    expect(getState().sidebarOpen).toBe(false);
    expect(runCommand("view.inspector")).toBe(true);
    expect(getState().inspectorOpen).toBe(true);
    expect(runCommand("query.new")).toBe(false);
    expect(runCommand("table.refresh")).toBe(false);
    expect(runCommand("export")).toBe(false);
  });

  it("acts on the active tab", async () => {
    const profile = newProfile({ name: "Mock" });
    await saveProfile(profile, "secret");
    await connect(profile);
    const tableTab = openTable(profile.id, USERS);
    await loadTable(tableTab);
    expect(runCommand("query.run")).toBe(false);
    getState();
    expect(runCommand("export")).toBe(true);
    expect(getState().dialog).toEqual({ kind: "export", tabId: tableTab });
    expect(runCommand("query.new")).toBe(true);
    expect(getState().tabs).toHaveLength(2);
    expect(runCommand("query.runAll")).toBe(true);
    expect(runCommand("tab.previous")).toBe(true);
    expect(getState().activeTabId).toBe(tableTab);
    expect(runCommand("tab.close")).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getState().tabs).toHaveLength(1);
  });
});
