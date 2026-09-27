// Parsing of PostgreSQL's ISO date/time output and relative-time labels.

import type { ValueKind } from "@/lib/types";

const TIMESTAMP_PATTERN =
  /^(\d{4,})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?)?(?:([+-])(\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?$/;
const TIME_PATTERN = /^(\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Milliseconds since the epoch for a date or timestamp (`DateStyle = ISO`), or milliseconds since
 * midnight for a time. Values without a zone are read as local time. `null` for anything else,
 * including `infinity` and BC dates.
 */
export function parseTemporal(text: string, kind: ValueKind): number | null {
  const value = text.trim();
  if (kind === "time") {
    const match = TIME_PATTERN.exec(value);
    if (!match) return null;
    const [, h, m, s, fraction] = match;
    return ((Number(h) * 60 + Number(m)) * 60 + Number(s) + Number(fraction ?? 0)) * 1000;
  }
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction, sign, zoneHours, zoneMinutes, zoneSeconds] =
    match;
  const parts = [
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
    Math.round(Number(fraction ?? 0) * 1000),
  ] as const;
  if (sign === undefined) {
    const local = new Date(...parts).getTime();
    return Number.isNaN(local) ? null : local;
  }
  const offset =
    (Number(zoneHours) * 3600 + Number(zoneMinutes ?? 0) * 60 + Number(zoneSeconds ?? 0)) *
    1000 *
    (sign === "-" ? -1 : 1);
  const utc = Date.UTC(...parts) - offset;
  return Number.isNaN(utc) ? null : utc;
}

const UNITS: [limit: number, size: number, label: string][] = [
  [45 * 60_000, 60_000, "min"],
  [22 * 3_600_000, 3_600_000, "h"],
  [26 * 86_400_000, 86_400_000, "d"],
  [320 * 86_400_000, 30.44 * 86_400_000, "mo"],
  [Infinity, 365.25 * 86_400_000, "y"],
];

/** "3 h ago", "in 2 d", "just now". */
export function relativeTime(time: number, now: number): string {
  const delta = now - time;
  const distance = Math.abs(delta);
  if (distance < 45_000) return "just now";
  for (const [limit, size, label] of UNITS) {
    if (distance < limit) {
      const amount = Math.max(1, Math.round(distance / size));
      return delta >= 0 ? `${amount} ${label} ago` : `in ${amount} ${label}`;
    }
  }
  return "";
}

/** Short axis label for a time in ms, picking the precision from the span it belongs to. */
export function formatTimeTick(time: number, span: number): string {
  const date = new Date(time);
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (span >= 2 * 365 * 86_400_000) return String(date.getFullYear());
  if (span >= 60 * 86_400_000) return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  if (span >= 3 * 86_400_000) return day;
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
