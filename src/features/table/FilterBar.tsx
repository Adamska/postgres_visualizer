import { X } from "lucide-react";

import { Button, IconButton } from "@/components/ui/Button";
import { Select } from "@/components/ui/Controls";
import { Input } from "@/components/ui/Input";
import {
  FILTER_OPERATORS,
  hasActiveFilters,
  operatorNeedsValue,
  type FilterOperator,
} from "@/core/query/tableQuery";
import type { TableStructure } from "@/lib/types";
import {
  addFilter,
  applyFilters,
  clearFilters,
  removeFilter,
  setRawWhere,
  updateFilter,
} from "@/state/actions/tableTab";
import type { TableTab } from "@/state/store";

const OPERATOR_OPTIONS = FILTER_OPERATORS.map((o) => ({ value: o.value, label: o.label }));

export function FilterBar({ tab, structure }: { tab: TableTab; structure: TableStructure }) {
  const columnOptions = structure.columns.map((c) => ({ value: c.name, label: c.name }));
  const apply = () => void applyFilters(tab.id);
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line bg-surface-sunken/60 px-3 py-2">
      {tab.query.filters.map((filter) => (
        <div key={filter.id} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={filter.enabled}
            onChange={(e) => {
              updateFilter(tab.id, filter.id, { enabled: e.target.checked });
              apply();
            }}
            className="accent-accent"
            aria-label="Enable filter"
          />
          <Select
            size="sm"
            value={filter.column}
            onChange={(column) => updateFilter(tab.id, filter.id, { column })}
            options={columnOptions}
            className="w-44"
            ariaLabel="Column"
          />
          <Select
            size="sm"
            value={filter.op}
            onChange={(op: FilterOperator) => {
              updateFilter(tab.id, filter.id, { op });
              if (!operatorNeedsValue(op)) apply();
            }}
            options={OPERATOR_OPTIONS}
            className="w-36"
            ariaLabel="Operator"
          />
          {operatorNeedsValue(filter.op) ? (
            <Input
              value={filter.value}
              onChange={(e) => updateFilter(tab.id, filter.id, { value: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder={
                filter.op === "in" || filter.op === "notIn"
                  ? "comma separated values"
                  : (structure.columns.find((c) => c.name === filter.column)?.typeName ?? "value")
              }
              mono
              className="flex-1 [&>input]:h-7"
            />
          ) : (
            <div className="flex-1" />
          )}
          <IconButton label="Remove filter" size="sm" onClick={() => void removeFilter(tab.id, filter.id)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-14 font-mono text-[11px] text-fg-subtle">WHERE</span>
        <Input
          value={tab.query.rawWhere}
          onChange={(e) => setRawWhere(tab.id, e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          placeholder="raw SQL condition, e.g. created_at > now() - interval '1 day'"
          mono
          className="flex-1 [&>input]:h-7"
        />
        <Button size="sm" onClick={() => addFilter(tab.id)}>
          Add filter
        </Button>
        <Button size="sm" variant="primary" onClick={apply}>
          Apply
        </Button>
        {hasActiveFilters(tab.query) && (
          <Button size="sm" variant="ghost" onClick={() => void clearFilters(tab.id)}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
