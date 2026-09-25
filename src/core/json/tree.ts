// JSON detection, parsing and the tree model behind the JSON viewer.

import type { ValueKind } from "@/lib/types";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonType = "object" | "array" | "string" | "number" | "boolean" | "null";
export type JsonPathPart = string | number;

/** One node of the tree; `id` is the JSON Pointer of the node, so it is stable across rebuilds. */
export interface JsonNode {
  id: string;
  key: JsonPathPart | null;
  path: JsonPathPart[];
  depth: number;
  type: JsonType;
  value: JsonValue;
  children: JsonNode[];
}

/** Parses `text`; `undefined` when it is not JSON. */
export function parseJson(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

/** Whether a text column value is worth showing as JSON: an object or an array. */
export function isJsonContainerText(text: string): boolean {
  const first = text.trimStart()[0];
  if (first !== "{" && first !== "[") return false;
  const value = parseJson(text);
  return value !== undefined && typeof value === "object" && value !== null;
}

/**
 * The JSON value a cell holds, if it should get the JSON treatment: any valid JSON for json/jsonb
 * columns, objects and arrays for text-like columns, nothing for other kinds.
 */
export function jsonValueOf(text: string | null | undefined, kind: ValueKind): JsonValue | undefined {
  if (text === null || text === undefined) return undefined;
  if (kind === "json") return parseJson(text);
  if (kind === "text" || kind === "other") return isJsonContainerText(text) ? parseJson(text) : undefined;
  return undefined;
}

export function jsonType(value: JsonValue): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  switch (typeof value) {
    case "object":
      return "object";
    case "string":
      return "string";
    case "number":
      return "number";
    default:
      return "boolean";
  }
}

export function isContainer(type: JsonType): boolean {
  return type === "object" || type === "array";
}

function pointer(path: JsonPathPart[]): string {
  return path.map((part) => `/${String(part).replace(/~/g, "~0").replace(/\//g, "~1")}`).join("");
}

/** Builds the full tree for a value. */
export function buildTree(value: JsonValue, path: JsonPathPart[] = []): JsonNode {
  const type = jsonType(value);
  const key = path.length === 0 ? null : (path[path.length - 1] ?? null);
  const depth = path.length;
  let children: JsonNode[] = [];
  if (type === "array") {
    children = (value as JsonValue[]).map((item, index) => buildTree(item, [...path, index]));
  } else if (type === "object") {
    children = Object.entries(value as Record<string, JsonValue>).map(([k, v]) => buildTree(v, [...path, k]));
  }
  return { id: pointer(path), key, path, depth, type, value, children };
}

/** Number of nodes in the tree, root included. */
export function nodeCount(node: JsonNode): number {
  return 1 + node.children.reduce((sum, child) => sum + nodeCount(child), 0);
}

/** Ids of every container node at most `depth` levels below the root (root is depth 0). */
export function idsUpToDepth(root: JsonNode, depth: number): Set<string> {
  const ids = new Set<string>();
  const visit = (node: JsonNode) => {
    if (!isContainer(node.type) || node.depth > depth) return;
    ids.add(node.id);
    node.children.forEach(visit);
  };
  visit(root);
  return ids;
}

/** Ids of every container node. */
export function allContainerIds(root: JsonNode): Set<string> {
  return idsUpToDepth(root, Number.POSITIVE_INFINITY);
}

/** Short description of a container: "3 keys", "1 item", "empty". */
export function nodeSummary(node: JsonNode): string {
  const count = node.children.length;
  if (count === 0) return "empty";
  if (node.type === "array") return `${count} ${count === 1 ? "item" : "items"}`;
  return `${count} ${count === 1 ? "key" : "keys"}`;
}

/** Text shown for a scalar, strings quoted as in JSON. */
export function scalarText(value: JsonValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Dotted path with brackets for indices: `settings.tags[0]`; the root is `$`. */
export function displayPath(path: JsonPathPart[]): string {
  if (path.length === 0) return "$";
  return path
    .map((part, index) => {
      if (typeof part === "number") return `[${part}]`;
      const safe = /^[A-Za-z_$][\w$]*$/.test(part) ? part : JSON.stringify(part);
      return index === 0 ? safe : `.${safe}`;
    })
    .join("");
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * A PostgreSQL expression reaching the node from `column`: `->` for containers, `->>` for the final
 * scalar so the result is text.
 */
export function sqlPath(column: string, path: JsonPathPart[], scalar: boolean): string {
  let expression = quoteIdentifier(column);
  path.forEach((part, index) => {
    const arrow = scalar && index === path.length - 1 ? "->>" : "->";
    const accessor = typeof part === "number" ? String(part) : `'${part.replace(/'/g, "''")}'`;
    expression += `${arrow}${accessor}`;
  });
  return expression;
}

/** Ids of nodes that match `query` (in key or scalar value) plus all their ancestors; `null` for no query. */
export function matchingIds(root: JsonNode, query: string): Set<string> | null {
  const needle = query.trim().toLowerCase();
  if (needle === "") return null;
  const ids = new Set<string>();
  const visit = (node: JsonNode): boolean => {
    const keyHit = node.key !== null && String(node.key).toLowerCase().includes(needle);
    const valueHit = !isContainer(node.type) && scalarText(node.value).toLowerCase().includes(needle);
    let childHit = false;
    for (const child of node.children) if (visit(child)) childHit = true;
    if (keyHit || valueHit || childHit) {
      ids.add(node.id);
      return true;
    }
    return false;
  };
  visit(root);
  return ids;
}

export interface VisibleRows {
  rows: JsonNode[];
  /** Rows left out because the tree is bigger than `limit`. */
  omitted: number;
}

/**
 * The rows to draw: the root's children, descending into expanded containers, keeping only nodes
 * in `filter` when a filter is set. A scalar root yields the root itself.
 */
export function visibleRows(
  root: JsonNode,
  expanded: ReadonlySet<string>,
  filter: ReadonlySet<string> | null,
  limit = 3000,
): VisibleRows {
  const rows: JsonNode[] = [];
  let omitted = 0;
  const push = (node: JsonNode) => {
    if (rows.length < limit) rows.push(node);
    else omitted += 1;
  };
  const visit = (node: JsonNode) => {
    for (const child of node.children) {
      if (filter && !filter.has(child.id)) continue;
      push(child);
      if (isContainer(child.type) && (expanded.has(child.id) || filter !== null)) visit(child);
    }
  };
  if (isContainer(root.type)) visit(root);
  else push(root);
  return { rows, omitted };
}

/** Re-indents JSON text; `null` when it is not valid JSON. */
export function formatJson(text: string, indent = 2): string | null {
  const value = parseJson(text);
  return value === undefined ? null : JSON.stringify(value, null, indent);
}

/** Removes insignificant whitespace; `null` when the text is not valid JSON. */
export function minifyJson(text: string): string | null {
  const value = parseJson(text);
  return value === undefined ? null : JSON.stringify(value);
}
