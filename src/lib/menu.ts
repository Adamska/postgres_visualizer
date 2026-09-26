// Bridges the native menu bar to app commands.

import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { isCommandId, runCommand } from "@/state/actions/commands";

import { isTauri } from "./platform";

/** Event emitted by the Rust side with the chosen menu item's command id. */
export const MENU_EVENT = "menu";

/** Runs menu commands while mounted; a no-op outside Tauri. */
export function useNativeMenu(): void {
  useEffect(() => {
    if (!isTauri()) return undefined;
    const unlisten = listen<string>(MENU_EVENT, (event) => {
      if (isCommandId(event.payload)) runCommand(event.payload);
    });
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);
}
