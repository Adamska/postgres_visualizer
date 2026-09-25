// Small tooltip showing a hovered header's type; Glide draws headers on canvas so it cannot host one itself.

import type { Rectangle } from "@glideapps/glide-data-grid";
import { useEffect, useState } from "react";

import type { GridColumn } from "./types";

/** A hovered header and its screen-space bounds. */
export interface HeaderHover {
  column: GridColumn;
  bounds: Rectangle;
}

const SHOW_DELAY_MS = 400;

/** Renders the column type under the hovered header after a short delay. */
export function HeaderTooltip({ hover }: { hover: HeaderHover | null }) {
  const [shown, setShown] = useState<HeaderHover | null>(null);

  useEffect(() => {
    if (hover === null) {
      setShown(null);
      return;
    }
    const timer = window.setTimeout(() => setShown(hover), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [hover]);

  if (shown === null) return null;
  const { column, bounds } = shown;
  const flags = [
    column.isPrimaryKey ? "primary key" : null,
    column.isNullable ? "nullable" : "not null",
  ].filter((flag) => flag !== null);
  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-md bg-fg px-2 py-1 text-[11.5px] font-medium whitespace-nowrap text-canvas shadow-pop"
      style={{ left: bounds.x + 8, top: bounds.y + bounds.height + 4 }}
    >
      <span className="font-mono">{column.typeName}</span>
      <span className="opacity-70"> · {flags.join(" · ")}</span>
    </div>
  );
}
