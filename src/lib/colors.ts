// Colours a connection profile can be tagged with.

import type { ProfileColor } from "@/lib/types";

export const PROFILE_COLORS: Record<ProfileColor, string | null> = {
  none: null,
  red: "#ef4444",
  orange: "#f59e0b",
  yellow: "#eab308",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#9ca3af",
};

/** Colour marking a production connection: its own, or red when it has none. */
export function productionColor(color: ProfileColor): string {
  return PROFILE_COLORS[color] ?? "#ef4444";
}
