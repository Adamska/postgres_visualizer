// Visual EXPLAIN: the plan as an indented tree with a heat bar per node (share of time, or of cost
// without ANALYZE), estimate mismatches and warnings, plus the hot spots at the top.

import { ChevronRight, Flame, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Segmented } from "@/components/ui/Controls";
import { hotspots, nodeShare, parsePlan, type ParsedPlan, type PlanNode } from "@/core/explain/plan";
import { formatDuration } from "@/core/format/values";
import { cn } from "@/lib/cn";
import type { QueryResult } from "@/lib/types";

function heatColor(share: number): string {
  if (share >= 0.5) return "var(--danger)";
  if (share >= 0.2) return "var(--warning)";
  return "var(--accent)";
}

function rowsLabel(node: PlanNode): string {
  const planned = node.planRows.toLocaleString("en-US");
  if (!node.actual) return `${planned} rows (est.)`;
  const actual = node.actual.rows.toLocaleString("en-US");
  const loops = node.actual.loops > 1 ? ` × ${node.actual.loops.toLocaleString("en-US")} loops` : "";
  return `${actual} rows${loops} · est. ${planned}`;
}

function NodeRow({
  node,
  plan,
  selected,
  collapsed,
  onSelect,
  onToggle,
}: {
  node: PlanNode;
  plan: ParsedPlan;
  selected: boolean;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const share = nodeShare(node, plan);
  return (
    <div
      role="treeitem"
      aria-selected={selected}
      aria-expanded={node.children.length > 0 ? !collapsed : undefined}
      onClick={onSelect}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md py-1.5 pr-3",
        selected ? "bg-accent-soft" : "hover:bg-fg/4",
      )}
      style={{ paddingLeft: 8 + node.depth * 18 }}
    >
      <button
        type="button"
        aria-label={collapsed ? "Expand" : "Collapse"}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center text-fg-subtle",
          node.children.length === 0 && "invisible",
        )}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", !collapsed && "rotate-90")} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[12.5px] font-medium">{node.title}</span>
          {node.warnings.length > 0 && (
            <TriangleAlert className="size-3.5 shrink-0 text-warning" aria-label={node.warnings.join("\n")} />
          )}
        </div>
        <div className="truncate text-[11px] text-fg-subtle">
          {rowsLabel(node)} · cost {node.startupCost.toFixed(2)}..{node.totalCost.toFixed(2)}
        </div>
      </div>
      <div className="flex w-44 shrink-0 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fg/8">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`, background: heatColor(share) }}
          />
        </div>
        <span className="w-20 text-right text-[11px] text-fg-muted tabular-nums">
          {node.exclusiveTime !== null ? formatDuration(node.exclusiveTime) : `${Math.round(share * 100)}%`}
        </span>
      </div>
    </div>
  );
}

function NodeDetails({ node, plan }: { node: PlanNode; plan: ParsedPlan }) {
  const share = nodeShare(node, plan);
  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <div className="text-[13px] font-semibold">{node.title}</div>
        <div className="mt-0.5 text-[11.5px] text-fg-muted">
          {Math.round(share * 100)}% of the {plan.analyzed ? "execution time" : "estimated cost"} spent in
          this node
        </div>
      </div>
      {node.warnings.map((warning) => (
        <div key={warning} className="flex gap-2 rounded-lg bg-warning-soft px-2.5 py-2 text-[12px]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {warning}
        </div>
      ))}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px]">
        <dt className="text-fg-subtle">Rows</dt>
        <dd>{rowsLabel(node)}</dd>
        {node.actual && (
          <>
            <dt className="text-fg-subtle">Time</dt>
            <dd>
              {formatDuration(node.actual.startupTime)} → {formatDuration(node.actual.totalTime)} per loop
              {node.exclusiveTime !== null && ` · ${formatDuration(node.exclusiveTime)} self`}
            </dd>
          </>
        )}
        <dt className="text-fg-subtle">Cost</dt>
        <dd>
          {node.startupCost.toFixed(2)}..{node.totalCost.toFixed(2)} ({node.exclusiveCost.toFixed(2)} self)
        </dd>
        <dt className="text-fg-subtle">Width</dt>
        <dd>{node.planWidth} bytes</dd>
        {node.details.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-fg-subtle">{key}</dt>
            <dd className="font-mono break-words select-text">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PlanView({ result }: { result: QueryResult }) {
  const text = useMemo(() => result.rows.map((row) => row[0] ?? "").join("\n"), [result]);
  const plan = useMemo(() => parsePlan(text), [text]);
  const [mode, setMode] = useState<"tree" | "json">("tree");
  const [selected, setSelected] = useState(0);
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(() => new Set());

  if (!plan) {
    return <pre className="h-full overflow-auto p-3 font-mono text-[12px] select-text">{text}</pre>;
  }
  const hidden = new Set<number>();
  const hide = (node: PlanNode) => {
    for (const child of node.children) {
      hidden.add(child.id);
      hide(child);
    }
  };
  plan.nodes.filter((n) => collapsed.has(n.id)).forEach(hide);
  const hot = hotspots(plan);
  const warnings = plan.nodes.reduce((total, n) => total + n.warnings.length, 0);
  const current = plan.nodes.find((n) => n.id === selected) ?? plan.root;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-3 py-2 text-[12px]">
        {plan.executionTime !== null && (
          <span>
            <span className="text-fg-subtle">Execution</span>{" "}
            <span className="font-semibold tabular-nums">{formatDuration(plan.executionTime)}</span>
          </span>
        )}
        {plan.planningTime !== null && (
          <span>
            <span className="text-fg-subtle">Planning</span>{" "}
            <span className="font-medium tabular-nums">{formatDuration(plan.planningTime)}</span>
          </span>
        )}
        <span>
          <span className="text-fg-subtle">Total cost</span>{" "}
          <span className="font-medium tabular-nums">{plan.root.totalCost.toFixed(2)}</span>
        </span>
        {!plan.analyzed && (
          <span className="text-fg-subtle">Estimates only: use Explain analyze for timings.</span>
        )}
        {warnings > 0 && (
          <span className="flex items-center gap-1 text-warning">
            <TriangleAlert className="size-3.5" /> {warnings} {warnings === 1 ? "warning" : "warnings"}
          </span>
        )}
        <span className="flex-1" />
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "tree", label: "Tree" },
            { value: "json", label: "JSON" },
          ]}
        />
      </div>
      {mode === "json" ? (
        <pre className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[12px] leading-relaxed select-text">
          {JSON.stringify(JSON.parse(text), null, 2)}
        </pre>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1 overflow-y-auto p-2" role="tree">
            {hot.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2 text-[11.5px]">
                <Flame className="size-3.5 text-danger" />
                <span className="text-fg-muted">Hot spots:</span>
                {hot.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelected(node.id)}
                    className="rounded-full bg-danger-soft px-2 py-0.5 font-medium text-fg hover:brightness-95"
                  >
                    {node.title} · {Math.round(nodeShare(node, plan) * 100)}%
                  </button>
                ))}
              </div>
            )}
            {plan.nodes
              .filter((node) => !hidden.has(node.id))
              .map((node) => (
                <NodeRow
                  key={node.id}
                  node={node}
                  plan={plan}
                  selected={node.id === current.id}
                  collapsed={collapsed.has(node.id)}
                  onSelect={() => setSelected(node.id)}
                  onToggle={() =>
                    setCollapsed((set) => {
                      const next = new Set(set);
                      if (next.has(node.id)) next.delete(node.id);
                      else next.add(node.id);
                      return next;
                    })
                  }
                />
              ))}
          </div>
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface-sunken/40">
            <NodeDetails node={current} plan={plan} />
          </aside>
        </div>
      )}
    </div>
  );
}
