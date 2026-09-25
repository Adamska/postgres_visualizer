import { Bookmark, ChevronDown, GitBranch, History, Play, Save, Square } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/Controls";
import { Divider } from "@/components/Primitives";
import { Button, IconButton, Spinner } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DropdownMenu } from "@/components/ui/Menu";
import { Popover } from "@/components/ui/Overlay";
import { cancelQuery, explainQuery, runDetached, runQuery, saveQuery } from "@/state/actions/queryTab";
import { useSettings } from "@/state/settings";
import type { QueryTab } from "@/state/store";

import { HistoryPopover, SavedQueriesPopover } from "./QueryPopovers";

export function QueryToolbar({ tab, onInsert }: { tab: QueryTab; onInsert: (sql: string) => void }) {
  const rowLimit = useSettings((s) => s.settings.queryRowLimit);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState(tab.customTitle ?? "");
  const empty = tab.text.trim() === "";

  const save = () => {
    if (name.trim() === "") return;
    void saveQuery(tab.id, name.trim());
    setSaveOpen(false);
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <Button
        size="sm"
        variant="primary"
        icon={<Play className="size-3.5 fill-current" />}
        disabled={tab.running || empty}
        onClick={() => void runQuery(tab.id, "current")}
        title="Run statement (⌘↩)"
      >
        Run
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={tab.running || empty}
        onClick={() => void runQuery(tab.id, "all")}
        title="Run all (⇧⌘↩)"
      >
        Run all
      </Button>
      <DropdownMenu
        trigger={
          <Button
            size="sm"
            variant="ghost"
            icon={<ChevronDown className="size-3.5" />}
            disabled={tab.running || empty}
          >
            Explain
          </Button>
        }
        items={[
          {
            id: "explain",
            label: "Explain",
            shortcut: "⌥⌘E",
            onSelect: () => void explainQuery(tab.id, false),
          },
          {
            id: "analyze",
            label: "Explain analyze",
            shortcut: "⇧⌥⌘E",
            onSelect: () => void explainQuery(tab.id, true),
          },
        ]}
      />
      {tab.running && (
        <>
          <IconButton label="Cancel query" onClick={() => void cancelQuery(tab.id)}>
            <Square className="size-3.5 fill-current" />
          </IconButton>
          <Spinner className="size-3.5 text-fg-muted" />
        </>
      )}
      <Divider vertical />
      <Popover
        trigger={
          <IconButton label="History">
            <History className="size-4" />
          </IconButton>
        }
        className="w-[520px] p-0"
      >
        <HistoryPopover profileId={tab.connectionId} onInsert={onInsert} />
      </Popover>
      <Popover
        trigger={
          <IconButton label="Saved queries">
            <Bookmark className="size-4" />
          </IconButton>
        }
        className="w-[440px] p-0"
      >
        <SavedQueriesPopover onInsert={onInsert} />
      </Popover>
      <Popover
        open={saveOpen}
        onOpenChange={setSaveOpen}
        trigger={
          <IconButton label="Save query (⌘S)" disabled={empty}>
            <Save className="size-4" />
          </IconButton>
        }
        className="w-72"
      >
        <div className="flex flex-col gap-2">
          <div className="text-[12.5px] font-medium">Save query</div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" disabled={name.trim() === ""} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      </Popover>
      <div className="flex-1" />
      {tab.inTransaction && (
        <div className="flex items-center gap-1.5">
          <Badge tone="warning" className="gap-1">
            <GitBranch className="size-3" /> In transaction
          </Badge>
          <Button size="sm" onClick={() => void runDetached(tab.id, "COMMIT")}>
            Commit
          </Button>
          <Button size="sm" onClick={() => void runDetached(tab.id, "ROLLBACK")}>
            Rollback
          </Button>
        </div>
      )}
      <span className="pl-2 text-[11px] text-fg-subtle" title="Row limit for query results (Settings)">
        Limit {rowLimit.toLocaleString("en-US")}
      </span>
    </div>
  );
}
