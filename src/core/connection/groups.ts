// Sidebar grouping: open and saved connections under the group of their profile.

import type { ConnectionProfile } from "@/lib/types";

import { profileDisplayName } from "./url";

export interface ConnectionGroup {
  /** Group name; empty for connections without one. */
  name: string;
  /** Open connections, in the order they were opened. */
  open: string[];
  /** Saved connections that are not open, by name. */
  closed: ConnectionProfile[];
}

export function groupName(profile: ConnectionProfile): string {
  return profile.group?.trim() ?? "";
}

/** Groups in sidebar order: ungrouped first, then by name. Empty groups are left out. */
export function groupConnections(
  profiles: readonly ConnectionProfile[],
  openIds: readonly string[],
): ConnectionGroup[] {
  const groups = new Map<string, ConnectionGroup>();
  const groupOf = (name: string) => {
    let group = groups.get(name);
    if (!group) {
      group = { name, open: [], closed: [] };
      groups.set(name, group);
    }
    return group;
  };
  const byId = new Map(profiles.map((p) => [p.id, p]));
  for (const id of openIds) {
    const profile = byId.get(id);
    if (profile) groupOf(groupName(profile)).open.push(id);
  }
  const open = new Set(openIds);
  for (const profile of profiles) {
    if (!open.has(profile.id)) groupOf(groupName(profile)).closed.push(profile);
  }
  for (const group of groups.values()) {
    group.closed.sort((a, b) => profileDisplayName(a).localeCompare(profileDisplayName(b)));
  }
  return [...groups.values()].sort((a, b) =>
    a.name === "" ? -1 : b.name === "" ? 1 : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}
