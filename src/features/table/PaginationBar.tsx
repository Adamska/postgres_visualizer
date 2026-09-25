import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton, Spinner } from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { formatCount, formatDuration } from "@/core/format/values";
import { PAGE_SIZES } from "@/core/query/tableQuery";
import { goToPage, setPageSize } from "@/state/actions/tableTab";
import type { TableTab } from "@/state/store";

const SIZE_OPTIONS = PAGE_SIZES.map((size) => ({ value: String(size), label: `${size} rows` }));

export function PaginationBar({ tab }: { tab: TableTab }) {
  const { query, result, totalCount } = tab;
  const rowCount = result?.rows.length ?? 0;
  const first = query.page * query.pageSize + 1;
  const last = query.page * query.pageSize + rowCount;
  const canNext = totalCount !== null ? last < totalCount : rowCount === query.pageSize;
  const range =
    rowCount === 0
      ? "No rows"
      : totalCount !== null
        ? `${first}–${last} of ${formatCount(totalCount)}`
        : `${first}–${last}`;

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 border-t border-line px-2 text-[12px] text-fg-muted">
      <Select
        size="sm"
        value={String(query.pageSize)}
        onChange={(v) => void setPageSize(tab.id, Number(v))}
        options={SIZE_OPTIONS}
        ariaLabel="Rows per page"
      />
      {result && (
        <span className="font-mono text-[11px] text-fg-subtle">{formatDuration(result.durationMs)}</span>
      )}
      {tab.loading && <Spinner className="size-3" />}
      <div className="flex-1" />
      {tab.selection.rows.length > 0 && <span>{tab.selection.rows.length} selected</span>}
      <span className="tabular-nums">{range}</span>
      <div className="flex items-center">
        <IconButton
          label="Previous page"
          size="sm"
          disabled={query.page === 0 || tab.loading}
          onClick={() => void goToPage(tab.id, query.page - 1)}
        >
          <ChevronLeft className="size-4" />
        </IconButton>
        <span className="min-w-14 text-center tabular-nums">Page {query.page + 1}</span>
        <IconButton
          label="Next page"
          size="sm"
          disabled={!canNext || tab.loading}
          onClick={() => void goToPage(tab.id, query.page + 1)}
        >
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}
