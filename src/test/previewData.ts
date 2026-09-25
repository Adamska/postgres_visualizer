// Sample profiles for the browser preview (no Tauri).

import { newProfile } from "@/core/connection/url";

import type { MockBackend } from "./mockBackend";

export function installPreviewData(mock: MockBackend): void {
  if (window.location.search.includes("empty")) return;
  const local = newProfile({
    id: "preview-local",
    name: "Local dev",
    color: "blue",
    group: null,
    lastConnectedAt: new Date().toISOString(),
  });
  const prod = newProfile({
    id: "preview-prod",
    name: "Supabase prod",
    host: "db.abc.supabase.co",
    color: "red",
    group: "Production",
    sslMode: "require",
  });
  const staging = newProfile({
    id: "preview-staging",
    name: "Staging",
    host: "staging.internal",
    color: "orange",
    group: "Production",
  });
  mock.documents.connections = [local, prod, staging];
  mock.documents.workspace = {
    connections: [
      {
        profileId: local.id,
        tabs: [
          {
            kind: "table",
            query: {
              table: { schema: "public", name: "users" },
              filters: [],
              rawWhere: "",
              sort: [],
              page: 0,
              pageSize: 200,
            },
          },
          {
            kind: "query",
            sql: "-- Customers with their order totals\nSELECT c.full_name, count(o.id) AS orders, sum(o.total) AS revenue\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE c.is_active AND c.email LIKE '%@example.com'\nGROUP BY c.id\nORDER BY revenue DESC\nLIMIT 50;",
            title: null,
          },
        ],
        activeIndex: 0,
      },
    ],
    activeProfileId: local.id,
  };
}
