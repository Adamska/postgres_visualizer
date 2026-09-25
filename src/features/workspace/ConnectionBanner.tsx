// Strip shown above the tabs when the active connection is lost or being re-opened.

import { RefreshCw, WifiOff } from "lucide-react";

import { Button, Spinner } from "@/components/ui/Button";
import { profileDisplayName } from "@/core/connection/url";
import { reconnect } from "@/state/actions/connections";
import { openDialog, useAppStore } from "@/state/store";

export function ConnectionBanner() {
  const connection = useAppStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    const id = active?.connectionId ?? s.activeConnectionId;
    return id === null ? undefined : s.connections[id];
  });
  if (!connection || connection.status === "connected" || connection.status === "failed") return null;
  const name = profileDisplayName(connection.profile);

  if (connection.status === "connecting") {
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line/70 bg-surface-sunken px-4 text-[12.5px] text-fg-muted">
        <Spinner className="size-3.5" />
        Connecting to {name}…
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex min-h-9 shrink-0 items-center gap-3 border-b border-warning/30 bg-warning-soft px-4 py-1 text-[12.5px] text-fg"
    >
      <WifiOff className="size-4 shrink-0 text-warning" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">Connection to {name} was lost.</span>
        {connection.error && <span className="ml-1.5 text-fg-muted">{connection.error}</span>}
      </span>
      <Button size="sm" onClick={() => openDialog({ kind: "connection", profileId: connection.id })}>
        Edit connection…
      </Button>
      <Button
        size="sm"
        variant="primary"
        icon={<RefreshCw className="size-3.5" />}
        onClick={() => void reconnect(connection.id)}
      >
        Reconnect
      </Button>
    </div>
  );
}
