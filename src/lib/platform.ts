// Runtime environment helpers.

/** True when running inside the Tauri webview (as opposed to a plain browser in development). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);

/** Command key on macOS, Control elsewhere. */
export function modKey(event: KeyboardEvent | React.KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

export const MOD = isMac ? "⌘" : "Ctrl+";
