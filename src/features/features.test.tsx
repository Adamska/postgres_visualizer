import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { newProfile } from "@/core/connection/url";
import { installBackend } from "@/lib/backend";
import type { QueryResult } from "@/lib/types";
import { connect } from "@/state/actions/connections";
import { clearPasswordCache, saveProfile } from "@/state/actions/profiles";
import { getState, resetStore } from "@/state/store";
import { createMockBackend, type MockBackend } from "@/test/mockBackend";
import { PLAN_RESULT } from "@/test/previewDataset";

import { SelectionStats } from "./grid/SelectionStats";
import type { GridContent } from "./grid/types";
import { CommandPalette } from "./palette/CommandPalette";
import { ColumnProfilePopover } from "./profile/ColumnProfilePopover";
import { PlanView } from "./query/PlanView";

let backend: MockBackend;
let restore: () => void;

beforeEach(() => {
  resetStore();
  clearPasswordCache();
  backend = createMockBackend();
  restore = installBackend(backend);
});

afterEach(() => restore());

describe("CommandPalette", () => {
  it("finds a table and opens it from the keyboard", async () => {
    const profile = newProfile({ name: "Mock" });
    await saveProfile(profile, "secret");
    await connect(profile);
    render(<CommandPalette />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "teams" } });
    await waitFor(() => expect(screen.getAllByRole("option")[0]?.textContent).toContain("teams"));
    fireEvent.keyDown(screen.getByLabelText("Search"), { key: "Enter" });
    const tab = getState().tabs[0];
    expect(tab?.kind === "table" && tab.query.table.name).toBe("teams");
  });

  it("lists commands when empty and reports misses", () => {
    render(<CommandPalette />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "zzzzqx" } });
    expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
  });
});

describe("PlanView", () => {
  it("shows the tree, hot spots and node details", () => {
    render(<PlanView result={PLAN_RESULT} />);
    expect(screen.getAllByRole("treeitem")).toHaveLength(7);
    expect(screen.getByText(/Hot spots/)).toBeInTheDocument();
    expect(screen.getAllByText("Seq Scan on orders o").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("Seq Scan on orders o")[0]!);
    expect(screen.getByText(/discards 152,000 rows/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Collapse" })[0]!);
    expect(screen.getAllByRole("treeitem")).toHaveLength(1);
  });

  it("falls back to text for other results", () => {
    const text: QueryResult = { ...PLAN_RESULT, rows: [["Seq Scan on users"]] };
    render(<PlanView result={text} />);
    expect(screen.getByText("Seq Scan on users")).toBeInTheDocument();
  });
});

describe("SelectionStats", () => {
  const cell = (raw: string | null) => ({
    text: raw ?? "NULL",
    raw,
    isNull: raw === null,
    isModified: false,
    isDefault: false,
    json: null,
    boolean: null,
    rich: null,
  });
  const content: GridContent = {
    columns: [
      {
        id: 0,
        name: "n",
        typeName: "int",
        kind: "integer",
        isPrimaryKey: false,
        isForeignKey: false,
        isNullable: true,
        isEditable: false,
        enumValues: null,
      },
    ],
    rows: [
      { cells: [cell("2")], state: "normal" },
      { cells: [cell("5")], state: "normal" },
      { cells: [cell(null)], state: "normal" },
    ],
    version: 0,
  };

  it("summarises a range and stays quiet for one cell", () => {
    const { rerender } = render(
      <SelectionStats
        content={content}
        selection={{
          rows: [0],
          focused: { row: 0, column: 0 },
          range: { rowStart: 0, rowEnd: 3, columns: [0] },
        }}
      />,
    );
    expect(screen.getByLabelText("Selection summary").textContent).toBe(
      "Count3Nulls1Distinct2Sum7Avg3.5Min2Max5",
    );
    rerender(
      <SelectionStats
        content={content}
        selection={{ rows: [0], focused: { row: 0, column: 0 }, range: null }}
      />,
    );
    expect(screen.queryByLabelText("Selection summary")).toBeNull();
  });
});

describe("ColumnProfilePopover", () => {
  it("profiles loaded values and filters on a click", async () => {
    let filtered: string | null | undefined;
    let closed = false;
    render(
      <ColumnProfilePopover
        request={{
          column: {
            id: 0,
            name: "status",
            typeName: "text",
            kind: "text",
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: true,
            isEditable: false,
            enumValues: null,
          },
          bounds: { x: 0, y: 0, width: 100, height: 30 },
        }}
        load={() => Promise.resolve(["paid", "paid", "late", null])}
        total={40}
        onFilter={(value) => {
          filtered = value;
        }}
        onClose={() => {
          closed = true;
        }}
      />,
    );
    await waitFor(() => expect(screen.getByText("Most frequent")).toBeInTheDocument());
    expect(screen.getByText("sample of 40")).toBeInTheDocument();
    fireEvent.click(screen.getByTitle("Filter status = paid"));
    expect(filtered).toBe("paid");
    expect(closed).toBe(true);
  });
});
