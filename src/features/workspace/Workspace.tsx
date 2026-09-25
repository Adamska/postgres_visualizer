import { Table2 } from "lucide-react";

import { EmptyState } from "@/components/Primitives";
import { Button } from "@/components/ui/Button";
import { WelcomeScreen } from "@/features/connections/WelcomeScreen";
import { QueryTab } from "@/features/query/QueryTab";
import { StructureTab } from "@/features/structure/StructureTab";
import { TableTab } from "@/features/table/TableTab";
import { openQuery } from "@/state/actions/workspace";
import { useAppStore } from "@/state/store";

import { ConnectionBanner } from "./ConnectionBanner";
import { TabBar } from "./TabBar";

export function Workspace() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const hasConnections = useAppStore((s) => s.connectionOrder.length > 0);
  const active = tabs.find((t) => t.id === activeTabId);

  if (!hasConnections) return <WelcomeScreen />;

  return (
    <>
      <TabBar />
      <ConnectionBanner />
      <div className="relative min-h-0 flex-1 overflow-hidden border-t border-line/70 bg-surface">
        {active ? (
          <TabContent key={active.id} tabId={active.id} kind={active.kind} />
        ) : (
          <EmptyState
            icon={<Table2 />}
            title="Pick a table"
            message="Choose a table in the sidebar, or open a new query tab."
          >
            <Button variant="primary" onClick={() => openQuery()}>
              New query tab
            </Button>
          </EmptyState>
        )}
      </div>
    </>
  );
}

function TabContent({ tabId, kind }: { tabId: string; kind: "table" | "query" | "structure" }) {
  switch (kind) {
    case "table":
      return <TableTab tabId={tabId} />;
    case "query":
      return <QueryTab tabId={tabId} />;
    case "structure":
      return <StructureTab tabId={tabId} />;
  }
}
