// Classifies cell values that deserve a richer rendering than plain text: timestamps with a
// relative hint, colour-tagged UUIDs, enum pills, array chips, colour swatches, grouped numbers
// and image links.

import type { ValueKind } from "@/lib/types";

import { parseTemporal } from "./temporal";

export type RichValue =
  | { kind: "timestamp"; text: string; time: number }
  | { kind: "uuid"; text: string; hue: number }
  | { kind: "enum"; text: string; hue: number }
  | { kind: "array"; items: (string | null)[] }
  | { kind: "color"; text: string; color: string }
  | { kind: "number"; text: string }
  | { kind: "image"; text: string };

export interface RichOptions {
  /** Relative hints after dates and timestamps. */
  relativeTimes: boolean;
  /** Thousands separators in numbers. */
  groupDigits: boolean;
}

export interface RichColumn {
  name: string;
  kind: ValueKind;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  enumValues: string[] | null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const IMAGE_PATTERN = /^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|avif|svg)(?:[?#]\S*)?$/i;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** Stable hue in [0, 360) for a string, so equal values share a colour. */
export function hueOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

/** Whether a column holds identifiers, whose digits should not be grouped. */
export function isIdentifierColumn(column: RichColumn): boolean {
  const name = column.name.toLowerCase();
  return column.isPrimaryKey || column.isForeignKey || name === "id" || name.endsWith("_id");
}

/** "1234567.891" → "1,234,567.891"; keeps the fractional digits as they are. */
export function groupDigits(text: string): string {
  if (!PLAIN_NUMBER.test(text)) return text;
  const negative = text.startsWith("-");
  const [whole = "", fraction] = (negative ? text.slice(1) : text).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

/**
 * Elements of a one-dimensional PostgreSQL array literal (`{a,"b c",NULL}`); `null` for
 * multi-dimensional or malformed input.
 */
export function parseArrayLiteral(text: string): (string | null)[] | null {
  // Arrays with explicit bounds ("[0:1]={1,2}") keep their text form.
  if (!text.startsWith("{") || !text.endsWith("}")) return null;
  const body = text.slice(1, -1);
  if (body === "") return [];
  const items: (string | null)[] = [];
  let i = 0;
  while (i <= body.length) {
    if (body[i] === "{") return null;
    let value = "";
    let quoted = false;
    if (body[i] === '"') {
      quoted = true;
      i += 1;
      while (i < body.length && body[i] !== '"') {
        if (body[i] === "\\") i += 1;
        value += body[i] ?? "";
        i += 1;
      }
      if (body[i] !== '"') return null;
      i += 1;
    } else {
      while (i < body.length && body[i] !== ",") {
        value += body[i] ?? "";
        i += 1;
      }
    }
    items.push(!quoted && value.toUpperCase() === "NULL" ? null : value);
    if (i >= body.length) break;
    if (body[i] !== ",") return null;
    i += 1;
  }
  return items;
}

/** The rich form of a non-null value, or `null` when plain text is best. */
export function richValue(value: string, column: RichColumn, options: RichOptions): RichValue | null {
  switch (column.kind) {
    case "timestamp":
    case "date": {
      if (!options.relativeTimes) return null;
      const time = parseTemporal(value, column.kind);
      return time === null ? null : { kind: "timestamp", text: value, time };
    }
    case "uuid":
      return UUID_PATTERN.test(value) ? { kind: "uuid", text: value, hue: hueOf(value) } : null;
    case "enumeration":
      return { kind: "enum", text: value, hue: hueOf(value) };
    case "array": {
      const items = parseArrayLiteral(value);
      return items ? { kind: "array", items } : null;
    }
    case "integer":
    case "decimal": {
      if (!options.groupDigits || isIdentifierColumn(column)) return null;
      const grouped = groupDigits(value);
      return grouped === value ? null : { kind: "number", text: grouped };
    }
    case "text":
      if (COLOR_PATTERN.test(value)) return { kind: "color", text: value, color: value };
      if (IMAGE_PATTERN.test(value)) return { kind: "image", text: value };
      if (column.enumValues === null && UUID_PATTERN.test(value)) {
        return { kind: "uuid", text: value, hue: hueOf(value) };
      }
      return null;
    default:
      return null;
  }
}

/** Plain text equivalent of a rich value, used for search and accessibility. */
export function richText(rich: RichValue): string {
  return rich.kind === "array" ? rich.items.map((item) => item ?? "NULL").join(", ") : rich.text;
}
