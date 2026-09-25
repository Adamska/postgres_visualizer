// Compact, single-line JSON previews for grid cells, as coloured segments.

import type { JsonValue } from "./tree";

export type SegmentKind = "key" | "string" | "number" | "boolean" | "null" | "punct";

export interface JsonSegment {
  kind: SegmentKind;
  text: string;
}

/** Characters a preview may hold before it is cut with an ellipsis. */
export const PREVIEW_BUDGET = 240;

const ELLIPSIS = "…";

function keyText(key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

/**
 * Segments for `{ theme: "dark", tags: ["a", 1] }`-style previews: keys unquoted when possible,
 * one space inside braces, cut with an ellipsis once `budget` characters are reached.
 */
export function previewSegments(value: JsonValue, budget = PREVIEW_BUDGET): JsonSegment[] {
  const segments: JsonSegment[] = [];
  let used = 0;
  let cut = false;

  const emit = (kind: SegmentKind, text: string): boolean => {
    if (cut) return false;
    if (used + text.length > budget) {
      const room = Math.max(0, budget - used);
      if (room > 1) segments.push({ kind, text: `${text.slice(0, room - 1)}${ELLIPSIS}` });
      else segments.push({ kind: "punct", text: ELLIPSIS });
      cut = true;
      return false;
    }
    segments.push({ kind, text });
    used += text.length;
    return true;
  };

  const write = (item: JsonValue): void => {
    if (cut) return;
    if (item === null) {
      emit("null", "null");
    } else if (typeof item === "boolean") {
      emit("boolean", item ? "true" : "false");
    } else if (typeof item === "number") {
      emit("number", String(item));
    } else if (typeof item === "string") {
      emit("string", JSON.stringify(item));
    } else if (Array.isArray(item)) {
      if (item.length === 0) {
        emit("punct", "[]");
        return;
      }
      emit("punct", "[");
      item.forEach((entry, index) => {
        if (index > 0) emit("punct", ", ");
        write(entry);
      });
      emit("punct", "]");
    } else {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        emit("punct", "{}");
        return;
      }
      emit("punct", "{ ");
      entries.forEach(([key, entry], index) => {
        if (index > 0) emit("punct", ", ");
        emit("key", keyText(key));
        emit("punct", ": ");
        write(entry);
      });
      emit("punct", " }");
    }
  };

  write(value);
  return segments;
}

export function segmentsText(segments: readonly JsonSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}
