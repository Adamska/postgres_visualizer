// Sample profiles for the browser preview (no Tauri).

import { newProfile } from "@/core/connection/url";

import type { MockBackend } from "./mockBackend";
import {
  CUSTOMERS_STRUCTURE,
  ORDERS_STRUCTURE,
  PREVIEW_GRAPH,
  PREVIEW_RELATIONS,
  previewResolve,
} from "./previewDataset";

/** Adds the orders and customers tables, reports and statistics to the mock. */
function extendMock(mock: MockBackend): void {
  mock.resolve = previewResolve;
  const { listRelations, tableStructure } = mock;
  mock.listRelations = async (sessionId, schema) => [
    ...(schema === "public" ? PREVIEW_RELATIONS : []),
    ...(await listRelations(sessionId, schema)),
  ];
  mock.tableStructure = (sessionId, schema, name) => {
    if (schema === "public" && name === "orders") return Promise.resolve(ORDERS_STRUCTURE);
    if (schema === "public" && name === "customers") return Promise.resolve(CUSTOMERS_STRUCTURE);
    return tableStructure(sessionId, schema, name);
  };
  mock.schemaGraph = (_sessionId, schema) =>
    Promise.resolve(schema === "public" ? PREVIEW_GRAPH : { schema, tables: [], foreignKeys: [] });
}

export function installPreviewData(mock: MockBackend): void {
  if (window.location.search.includes("empty")) return;
  extendMock(mock);
  const local = newProfile({
    id: "preview-local",
    name: "Local dev",
    color: "blue",
    group: null,
    environment: "development",
    lastConnectedAt: new Date().toISOString(),
  });
  const prod = newProfile({
    id: "preview-prod",
    name: "Supabase prod",
    host: "db.abc.supabase.co",
    color: "red",
    group: "Production",
    sslMode: "require",
    environment: "production",
  });
  const staging = newProfile({
    id: "preview-staging",
    name: "Staging",
    host: "staging.internal",
    color: "orange",
    group: "Production",
    environment: "staging",
    readOnly: true,
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
              table: { schema: "public", name: "orders" },
              filters: [],
              rawWhere: "",
              search: "",
              sort: [],
              page: 0,
              pageSize: 200,
            },
          },
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
