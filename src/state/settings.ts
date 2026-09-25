// User preferences, persisted as the "settings" document.

import { create } from "zustand";

import { backend } from "@/lib/backend";
import type { PasswordStorage } from "@/lib/types";

export type ThemeSetting = "system" | "light" | "dark";

export interface Settings {
  theme: ThemeSetting;
  pageSize: number;
  queryRowLimit: number;
  editorFontSize: number;
  gridFontSize: number;
  restoreWorkspace: boolean;
  showSystemSchemas: boolean;
  confirmBeforeCommit: boolean;
  passwordStorage: PasswordStorage;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  pageSize: 200,
  queryRowLimit: 1000,
  editorFontSize: 13,
  gridFontSize: 13,
  restoreWorkspace: true,
  showSystemSchemas: false,
  confirmBeforeCommit: true,
  passwordStorage: "keychain",
};

interface SettingsStore {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const stored = await backend().loadDocument<Partial<Settings>>("settings");
    set({ settings: { ...DEFAULT_SETTINGS, ...(stored ?? {}) }, loaded: true });
  },
  update: async (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    await backend().saveDocument("settings", settings);
  },
}));

/** Resolves the effective colour scheme from the setting and the OS preference. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): "light" | "dark" {
  if (setting === "system") return prefersDark ? "dark" : "light";
  return setting;
}
