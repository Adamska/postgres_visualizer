// Parses `EXPLAIN (FORMAT JSON)` output into a tree with per-node exclusive time and cost, plus
// warnings for the usual performance smells.

export interface PlanActuals {
  startupTime: number;
  totalTime: number;
  rows: number;
  loops: number;
}

export interface PlanNode {
  id: number;
  depth: number;
  nodeType: string;
  /** "Seq Scan on users u", "Hash Join", "Index Scan using users_pkey on users". */
  title: string;
  relation: string | null;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actual: PlanActuals | null;
  /** Milliseconds spent in this node alone, over all loops; `null` without ANALYZE. */
  exclusiveTime: number | null;
  /** Cost of this node alone. */
  exclusiveCost: number;
  /** Remaining properties, formatted for display. */
  details: [string, string][];
  warnings: string[];
  children: PlanNode[];
}

export interface ParsedPlan {
  root: PlanNode;
  /** Every node, depth first. */
  nodes: PlanNode[];
  analyzed: boolean;
  planningTime: number | null;
  executionTime: number | null;
}

type RawNode = Record<string, unknown>;

/** Keys rendered in the header or computed, so they are left out of `details`. */
const SUMMARY_KEYS = new Set([
  "Node Type",
  "Relation Name",
  "Alias",
  "Index Name",
  "Startup Cost",
  "Total Cost",
  "Plan Rows",
  "Plan Width",
  "Actual Startup Time",
  "Actual Total Time",
  "Actual Rows",
  "Actual Loops",
  "Plans",
  "Parallel Aware",
  "Async Capable",
]);

/** Estimates this far off (in either direction) get flagged. */
export const ESTIMATE_FACTOR = 10;

function numberOf(node: RawNode, key: string): number {
  const value = node[key];
  return typeof value === "number" ? value : 0;
}

function textOf(node: RawNode, key: string): string | null {
  const value = node[key];
  return typeof value === "string" ? value : null;
}

function formatDetail(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatDetail).join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return String(value);
}

function titleOf(node: RawNode): string {
  const type = textOf(node, "Node Type") ?? "Node";
  const strategy = textOf(node, "Strategy");
  const join = textOf(node, "Join Type");
  let title = type;
  if (type === "Aggregate" && strategy && strategy !== "Plain") title = `${strategy} ${type}`;
  if (join && join !== "Inner") title = `${title} (${join})`;
  const index = textOf(node, "Index Name");
  if (index) title += ` using ${index}`;
  const relation = textOf(node, "Relation Name") ?? textOf(node, "CTE Name") ?? textOf(node, "Function Name");
  if (relation) {
    const alias = textOf(node, "Alias");
    title += ` on ${relation}${alias && alias !== relation ? ` ${alias}` : ""}`;
  }
  return title;
}

function warningsOf(node: RawNode, actual: PlanActuals | null): string[] {
  const warnings: string[] = [];
  const type = textOf(node, "Node Type") ?? "";
  const planRows = numberOf(node, "Plan Rows");
  if (actual) {
    const high = Math.max(planRows, actual.rows);
    const low = Math.max(1, Math.min(planRows, actual.rows));
    // Underestimates mislead join and memory choices; overestimates only matter at scale.
    const under = actual.rows > planRows;
    if (high >= (under ? 100 : 10_000) && high / low >= ESTIMATE_FACTOR) {
      const direction = actual.rows > planRows ? "under" : "over";
      warnings.push(
        `Row estimate ${direction}estimated ${Math.round(high / low)}× (planned ${planRows.toLocaleString("en-US")}, got ${actual.rows.toLocaleString("en-US")})`,
      );
    }
    const removed = numberOf(node, "Rows Removed by Filter");
    // A filter that throws away most of the table is what an index is for.
    if (type === "Seq Scan" && removed >= 1000 && removed >= actual.rows * 2) {
      warnings.push(
        `Sequential scan discards ${removed.toLocaleString("en-US")} rows per loop: an index on the filter may help`,
      );
    }
  }
  if (textOf(node, "Sort Space Type") === "Disk") {
    warnings.push(`Sort spilled to disk (${numberOf(node, "Sort Space Used").toLocaleString("en-US")} kB)`);
  }
  const batches = numberOf(node, "Hash Batches");
  if (batches > 1) warnings.push(`Hash spilled to disk in ${batches} batches`);
  return warnings;
}

function buildNode(raw: RawNode, depth: number, counter: { next: number }, flat: PlanNode[]): PlanNode {
  const analyzed = "Actual Total Time" in raw || "Actual Loops" in raw;
  const actual: PlanActuals | null = analyzed
    ? {
        startupTime: numberOf(raw, "Actual Startup Time"),
        totalTime: numberOf(raw, "Actual Total Time"),
        rows: numberOf(raw, "Actual Rows"),
        loops: numberOf(raw, "Actual Loops"),
      }
    : null;
  const node: PlanNode = {
    id: counter.next++,
    depth,
    nodeType: textOf(raw, "Node Type") ?? "Node",
    title: titleOf(raw),
    relation: textOf(raw, "Relation Name"),
    startupCost: numberOf(raw, "Startup Cost"),
    totalCost: numberOf(raw, "Total Cost"),
    planRows: numberOf(raw, "Plan Rows"),
    planWidth: numberOf(raw, "Plan Width"),
    actual,
    exclusiveTime: null,
    exclusiveCost: 0,
    details: Object.entries(raw)
      .filter(([key]) => !SUMMARY_KEYS.has(key))
      .map(([key, value]) => [key, formatDetail(value)]),
    warnings: warningsOf(raw, actual),
    children: [],
  };
  flat.push(node);
  const plans = raw.Plans;
  if (Array.isArray(plans)) {
    node.children = plans
      .filter((child): child is RawNode => typeof child === "object" && child !== null)
      .map((child) => buildNode(child, depth + 1, counter, flat));
  }
  const childCost = node.children.reduce((total, child) => total + child.totalCost, 0);
  node.exclusiveCost = Math.max(0, node.totalCost - childCost);
  if (actual) {
    const inclusive = (n: PlanNode) => (n.actual ? n.actual.totalTime * Math.max(1, n.actual.loops) : 0);
    const childTime = node.children.reduce((total, child) => total + inclusive(child), 0);
    node.exclusiveTime = Math.max(0, inclusive(node) - childTime);
  }
  return node;
}

/** Parses the JSON text of an EXPLAIN; `null` when it is not a plan. */
export function parsePlan(text: string): ParsedPlan | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const top = Array.isArray(parsed) ? (parsed[0] as unknown) : parsed;
  if (typeof top !== "object" || top === null || !("Plan" in top)) return null;
  const document = top as RawNode;
  const plan = document.Plan;
  if (typeof plan !== "object" || plan === null) return null;
  const nodes: PlanNode[] = [];
  const root = buildNode(plan as RawNode, 0, { next: 0 }, nodes);
  const planning = document["Planning Time"];
  const execution = document["Execution Time"];
  return {
    root,
    nodes,
    analyzed: root.actual !== null,
    planningTime: typeof planning === "number" ? planning : null,
    executionTime: typeof execution === "number" ? execution : null,
  };
}

/** Share of the whole plan attributable to a node alone: time when analysed, else cost. */
export function nodeShare(node: PlanNode, plan: ParsedPlan): number {
  if (plan.analyzed && node.exclusiveTime !== null) {
    const total = plan.nodes.reduce((sum, n) => sum + (n.exclusiveTime ?? 0), 0);
    return total > 0 ? node.exclusiveTime / total : 0;
  }
  const total = plan.nodes.reduce((sum, n) => sum + n.exclusiveCost, 0);
  return total > 0 ? node.exclusiveCost / total : 0;
}

/** The nodes that account for most of the plan, heaviest first. */
export function hotspots(plan: ParsedPlan, limit = 3, threshold = 0.1): PlanNode[] {
  return plan.nodes
    .map((node) => ({ node, share: nodeShare(node, plan) }))
    .filter((entry) => entry.share >= threshold)
    .sort((a, b) => b.share - a.share)
    .slice(0, limit)
    .map((entry) => entry.node);
}
