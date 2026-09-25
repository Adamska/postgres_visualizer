import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JsonViewer } from "./JsonViewer";

const VALUE = {
  theme: "dark",
  notifications: { email: true, push: false },
  tags: ["admin", "beta"],
  score: 42.5,
  bio: null,
};

/** Key of each visible row, in order. */
function rowKeys(): string[] {
  return screen.getAllByRole("treeitem").map((row) => row.getAttribute("data-key") ?? "");
}

describe("JsonViewer", () => {
  it("renders top-level keys collapsed with summaries and inline previews", () => {
    render(<JsonViewer value={VALUE} />);
    expect(rowKeys()).toEqual(["theme", "notifications", "tags", "score", "bio"]);
    expect(screen.getByText('"dark"')).toBeInTheDocument();
    expect(screen.getByText("2 keys")).toBeInTheDocument();
    expect(screen.getByText("2 items")).toBeInTheDocument();
    expect(screen.getByText("null")).toBeInTheDocument();
    // The collapsed preview shows the children inline.
    expect(screen.getByText("notifications").closest("[role=treeitem]")?.textContent).toContain("email");
  });

  it("expands a container on click and collapses it again", () => {
    render(<JsonViewer value={VALUE} />);
    const [expand] = screen.getAllByRole("button", { name: "Expand" });
    fireEvent.click(expand!);
    expect(rowKeys()).toEqual(["theme", "notifications", "email", "push", "tags", "score", "bio"]);
    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(rowKeys()).toHaveLength(5);
  });

  it("starts expanded to the requested depth", () => {
    render(<JsonViewer value={VALUE} initialDepth={2} />);
    expect(rowKeys()).toEqual(["theme", "notifications", "email", "push", "tags", "0", "1", "score", "bio"]);
  });

  it("filters rows and keeps the ancestors of matches", () => {
    render(<JsonViewer value={VALUE} toolbar />);
    fireEvent.change(screen.getByLabelText("Filter JSON"), { target: { value: "push" } });
    expect(rowKeys()).toEqual(["notifications", "push"]);
    fireEvent.change(screen.getByLabelText("Filter JSON"), { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
  });

  it("shows scalar roots and empty containers", () => {
    const { unmount } = render(<JsonViewer value="hello" />);
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    unmount();
    render(<JsonViewer value={[]} />);
    expect(screen.getByText("empty array")).toBeInTheDocument();
  });
});
