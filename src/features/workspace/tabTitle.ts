// Display title of a workspace tab.

import { displayName } from "@/core/sql/quote";
import { queryTitle } from "@/state/actions/queryTab";
import type { Tab } from "@/state/store";

export function tabTitle(tab: Tab): string {
  switch (tab.kind) {
    case "table":
      return displayName(tab.query.table);
    case "structure":
      return displayName(tab.table);
    case "query":
      return queryTitle(tab);
    case "diagram":
      return `${tab.schema} diagram`;
    case "server":
      return tab.pane === "activity" ? "Server activity" : "Server health";
  }
}
