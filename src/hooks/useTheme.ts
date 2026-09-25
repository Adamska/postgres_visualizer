import { useEffect, useState } from "react";

import { resolveTheme, useSettings } from "@/state/settings";

/** Applies the theme to `<html data-theme>` and returns the effective scheme. */
export function useTheme(): "light" | "dark" {
  const setting = useSettings((s) => s.settings.theme);
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const theme = resolveTheme(setting, prefersDark);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return theme;
}
