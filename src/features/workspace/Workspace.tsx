import { Table2 } from "lucide-react";

import { EmptyState } from "@/components/Primitives";
import { Button } from "@/components/ui/Button";
import { WelcomeScreen } from "@/features/connections/WelcomeScreen";
import { DiagramTab } from "@/features/diagram/DiagramTab";
import { QueryTab } from "@/features/query/QueryTab";
import { ServerTab } from "@/features/server/ServerTab";
import { StructureTab } from "@/features/structure/StructureTab";
import { TableTab } from "@/features/table/TableTab";
import { productionColor } from "@/lib/colors";
import { openQuery } from "@/state/actions/workspace";
import { useAppStore, type Tab } from "@/state/store";

import { ConnectionBanner } from "./ConnectionBanner";
import { TabBar } from "./TabBar";

export function Workspace() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const hasConnections = useAppStore((s) => s.connectionOrder.length > 0);
  const active = tabs.find((t) => t.id === activeTabId);
  const production = useAppStore((s) => {
    const id = active?.connectionId ?? s.activeConnectionId;
    const profile = id === null ? undefined : s.connections[id]?.profile;
    return profile?.environment === "production" ? profile.color : null;
  });

  if (!hasConnections) return <WelcomeScreen />;

  return (
    <>
      {production !== null && (
        <div
          className="h-[3px] shrink-0"
          style={{ background: productionColor(production) }}
          aria-label="Production connection"
        />
      )}
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

function TabContent({ tabId, kind }: { tabId: string; kind: Tab["kind"] }) {
  switch (kind) {
    case "table":
      return <TableTab tabId={tabId} />;
    case "query":
      return <QueryTab tabId={tabId} />;
    case "structure":
      return <StructureTab tabId={tabId} />;
    case "diagram":
      return <DiagramTab tabId={tabId} />;
    case "server":
      return <ServerTab tabId={tabId} />;
  }
}
