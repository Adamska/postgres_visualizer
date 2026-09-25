import { KeyRound, RefreshCw } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { ErrorBanner } from "@/components/Primitives";
import { IconButton, Spinner } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Controls";
import { qualifiedName } from "@/core/sql/quote";
import { cn } from "@/lib/cn";
import { loadStructureTab } from "@/state/actions/structureTab";
import { useAppStore, type StructureTab as StructureTabState } from "@/state/store";

export function StructureTab({ tabId }: { tabId: string }) {
  const tab = useAppStore((s) =>
    s.tabs.find((t): t is StructureTabState => t.id === tabId && t.kind === "structure"),
  );
  useEffect(() => {
    if (tab && !tab.structure && !tab.loading && !tab.error) void loadStructureTab(tabId);
  }, [tab, tabId]);
  if (!tab) return null;
  const { structure } = tab;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="font-mono text-[12.5px]">{qualifiedName(tab.table)}</span>
        {structure && <Badge>{structure.kind}</Badge>}
        <span className="flex-1" />
        <IconButton label="Refresh" onClick={() => void loadStructureTab(tabId, true)}>
          <RefreshCw className="size-4" />
        </IconButton>
      </div>
      {tab.error && <ErrorBanner error={tab.error} />}
      {!structure && tab.loading && (
        <div className="flex flex-1 items-center justify-center text-fg-muted">
          <Spinner className="size-4" />
        </div>
      )}
      {structure && (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {structure.comment && <p className="mb-4 text-[12.5px] text-fg-muted">{structure.comment}</p>}
          <Section title="Columns" count={structure.columns.length}>
            <Table header={["Name", "Type", "Nullable", "Default", "Comment"]}>
              {structure.columns.map((c) => (
                <tr key={c.name}>
                  <Cell mono>
                    <span className="flex items-center gap-1.5">
                      {c.isPrimaryKey && <KeyRound className="size-3 text-warning" />}
                      {c.name}
                    </span>
                  </Cell>
                  <Cell mono>{c.typeName}</Cell>
                  <Cell muted={c.isNullable}>{c.isNullable ? "yes" : "no"}</Cell>
                  <Cell mono muted>
                    {c.isIdentity ? "identity" : c.isGenerated ? "generated" : (c.defaultValue ?? "")}
                  </Cell>
                  <Cell muted>{c.comment ?? ""}</Cell>
                </tr>
              ))}
            </Table>
          </Section>
          {structure.indexes.length > 0 && (
            <Section title="Indexes" count={structure.indexes.length}>
              <Table header={["Name", "Columns", "Kind", "Definition"]}>
                {structure.indexes.map((i) => (
                  <tr key={i.name}>
                    <Cell mono>{i.name}</Cell>
                    <Cell mono>{i.columns.join(", ")}</Cell>
                    <Cell>{i.isPrimary ? "primary" : i.isUnique ? "unique" : ""}</Cell>
                    <Cell mono muted>
                      {i.definition}
                    </Cell>
                  </tr>
                ))}
              </Table>
            </Section>
          )}
          {structure.constraints.length > 0 && (
            <Section title="Constraints" count={structure.constraints.length}>
              <Table header={["Name", "Kind", "Definition"]}>
                {structure.constraints.map((c) => (
                  <tr key={c.name}>
                    <Cell mono>{c.name}</Cell>
                    <Cell>{c.kind.replace(/([A-Z])/g, " $1").toLowerCase()}</Cell>
                    <Cell mono muted>
                      {c.definition}
                    </Cell>
                  </tr>
                ))}
              </Table>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-[12.5px] font-semibold">
        {title} <span className="font-normal text-fg-subtle">· {count}</span>
      </h2>
      <div className="overflow-hidden rounded-lg border border-line">{children}</div>
    </section>
  );
}

function Table({ header, children }: { header: string[]; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-[12px]">
      <thead>
        <tr className="bg-surface-sunken text-left text-[11px] font-medium text-fg-muted">
          {header.map((h) => (
            <th key={h} className="px-3 py-1.5 font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="[&>tr]:border-t [&>tr]:border-line">{children}</tbody>
    </table>
  );
}

function Cell({
  children,
  mono = false,
  muted = false,
}: {
  children: ReactNode;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "px-3 py-1.5 align-top select-text",
        mono && "font-mono text-[11.5px]",
        muted && "text-fg-muted",
      )}
    >
      {children}
    </td>
  );
}
