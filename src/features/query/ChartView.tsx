// Quick chart of a query result: bar, line, area or scatter, with axis pickers, a legend for
// several series and a hover tooltip. The grid view doubles as the chart's table view.

import { useEffect, useMemo, useRef, useState } from "react";

import { Segmented, Select } from "@/components/ui/Controls";
import {
  axisKindOf,
  buildChartData,
  formatTick,
  maxSeries,
  measureColumns,
  mixedScales,
  niceTicks,
  suggestChart,
  valueExtent,
  type ChartData,
  type ChartSpec,
  type ChartType,
} from "@/core/chart/chart";
import { formatTimeTick } from "@/core/format/temporal";
import { formatStat } from "@/core/stats/selectionStats";
import { cn } from "@/lib/cn";
import type { QueryResult } from "@/lib/types";

const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
];
const MARGIN = { top: 12, right: 20, bottom: 30, left: 56 };
const MAX_BAR = 24;

function seriesColor(index: number): string {
  return SERIES[index % SERIES.length] ?? "var(--series-1)";
}

function useSize(): [React.RefObject<HTMLDivElement | null>, { width: number; height: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

interface Hover {
  x: number;
  y: number;
  title: string;
  rows: { name: string; value: number | null; color: string }[];
}

/** Rounded-top bar path growing from the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return "";
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function Plot({
  data,
  type,
  width,
  height,
}: {
  data: ChartData;
  type: ChartType;
  width: number;
  height: number;
}) {
  const [hover, setHover] = useState<Hover | null>(null);
  const innerWidth = Math.max(10, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(10, height - MARGIN.top - MARGIN.bottom);
  const includeZero = type === "bar" || type === "area";
  const [low, high] = valueExtent(data, includeZero);
  const yScale = niceTicks(low, high, Math.max(2, Math.floor(innerHeight / 48)));
  const y = (value: number) =>
    MARGIN.top + innerHeight - ((value - yScale.min) / (yScale.max - yScale.min || 1)) * innerHeight;

  const category = data.xKind === "category";
  const band = category ? innerWidth / Math.max(1, data.points.length) : 0;
  const numericX = data.points.map((p) => (typeof p.x === "number" ? p.x : 0));
  const xMin = numericX.reduce((a, b) => Math.min(a, b), Infinity);
  const xMax = numericX.reduce((a, b) => Math.max(a, b), -Infinity);
  const xTicks =
    data.xKind === "number" ? niceTicks(xMin, xMax, Math.max(2, Math.floor(innerWidth / 90))) : null;
  const domain = xTicks ? [xTicks.min, xTicks.max] : [xMin, xMax];
  const xOf = (index: number): number => {
    if (category) return MARGIN.left + band * index + band / 2;
    const value = numericX[index] ?? 0;
    const span = (domain[1] ?? 0) - (domain[0] ?? 0) || 1;
    return MARGIN.left + ((value - (domain[0] ?? 0)) / span) * innerWidth;
  };

  // X axis labels.
  let xLabels: { x: number; text: string }[] = [];
  if (category) {
    const step = Math.max(1, Math.ceil(data.points.length / Math.max(1, Math.floor(innerWidth / 70))));
    xLabels = data.points
      .map((p, i) => ({ x: xOf(i), text: p.label.length > 12 ? `${p.label.slice(0, 11)}…` : p.label, i }))
      .filter((l) => l.i % step === 0);
  } else if (data.xKind === "time") {
    const count = Math.max(2, Math.floor(innerWidth / 110));
    const span = xMax - xMin;
    xLabels = Array.from({ length: count + 1 }, (_, i) => {
      const time = xMin + (span * i) / count;
      return { x: MARGIN.left + (innerWidth * i) / count, text: formatTimeTick(time, span) };
    });
  } else if (xTicks) {
    xLabels = xTicks.ticks.map((tick) => ({
      x: MARGIN.left + ((tick - xTicks.min) / (xTicks.max - xTicks.min || 1)) * innerWidth,
      text: formatTick(tick),
    }));
  }

  const series = data.series.map((name, s) => ({ name, color: seriesColor(s), index: s }));
  const groupWidth = Math.min(band * 0.7, MAX_BAR * series.length + 2 * (series.length - 1));
  const barWidth =
    series.length > 0 ? Math.min(MAX_BAR, (groupWidth - 2 * (series.length - 1)) / series.length) : 0;
  const zero = y(Math.max(yScale.min, Math.min(0, yScale.max)));
  const showMarkers = data.points.length <= 60;

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    if (data.points.length === 0) return;
    let index = 0;
    if (category) {
      index = Math.min(data.points.length - 1, Math.max(0, Math.floor((px - MARGIN.left) / band)));
    } else {
      let best = Infinity;
      data.points.forEach((point, i) => {
        const dx = xOf(i) - px;
        const distance = type === "scatter" ? Math.hypot(dx, y(point.values[0] ?? 0) - py) : Math.abs(dx);
        if (distance < best) {
          best = distance;
          index = i;
        }
      });
    }
    const point = data.points[index];
    if (!point) return;
    setHover({
      x: xOf(index),
      y: py,
      title: `${data.xName}: ${point.label}`,
      rows: series.map((s) => ({ name: s.name, value: point.values[s.index] ?? null, color: s.color })),
    });
  };

  return (
    <div className="relative h-full w-full">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
        {yScale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + innerWidth}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--line)"
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-fg-subtle text-[10.5px] tabular-nums"
            >
              {formatTick(tick)}
            </text>
          </g>
        ))}
        <line
          x1={MARGIN.left}
          x2={MARGIN.left + innerWidth}
          y1={zero}
          y2={zero}
          stroke="var(--line-strong)"
          strokeWidth={1}
        />
        {xLabels.map((label, i) => (
          <text
            key={`${label.x}-${i}`}
            x={label.x}
            y={MARGIN.top + innerHeight + 18}
            textAnchor="middle"
            className="fill-fg-subtle text-[10.5px] tabular-nums"
          >
            {label.text}
          </text>
        ))}
        {hover && type !== "bar" && type !== "scatter" && (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={MARGIN.top}
            y2={MARGIN.top + innerHeight}
            stroke="var(--line-strong)"
          />
        )}
        {type === "bar" &&
          data.points.map((point, i) =>
            series.map((s) => {
              const value = point.values[s.index];
              if (value === null || value === undefined) return null;
              const x0 = xOf(i) - groupWidth / 2 + s.index * (barWidth + 2);
              const top = Math.min(y(value), zero);
              const h = Math.abs(zero - y(value));
              return (
                <path
                  key={`${i}-${s.index}`}
                  d={
                    value >= 0
                      ? barPath(x0, top, barWidth, h)
                      : `M${x0},${zero}h${barWidth}v${h}h${-barWidth}Z`
                  }
                  fill={s.color}
                  opacity={hover && hover.title !== `${data.xName}: ${point.label}` ? 0.55 : 1}
                />
              );
            }),
          )}
        {(type === "line" || type === "area") &&
          series.map((s) => {
            const points = data.points
              .map((p, i) => ({ x: xOf(i), value: p.values[s.index] ?? null }))
              .filter((p): p is { x: number; value: number } => p.value !== null);
            if (points.length === 0) return null;
            const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${y(p.value)}`).join("");
            const area = `${line}L${points.at(-1)?.x ?? 0},${zero}L${points[0]?.x ?? 0},${zero}Z`;
            return (
              <g key={s.index}>
                {type === "area" && <path d={area} fill={s.color} opacity={0.1} />}
                <path
                  d={line}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {showMarkers &&
                  points.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={y(p.value)}
                      r={3}
                      fill={s.color}
                      stroke="var(--surface)"
                      strokeWidth={2}
                    />
                  ))}
              </g>
            );
          })}
        {type === "scatter" &&
          series.map((s) =>
            data.points.map((p, i) => {
              const value = p.values[s.index];
              if (value === null || value === undefined) return null;
              return (
                <circle
                  key={`${s.index}-${i}`}
                  cx={xOf(i)}
                  cy={y(value)}
                  r={4}
                  fill={s.color}
                  fillOpacity={0.85}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              );
            }),
          )}
        {hover &&
          type !== "bar" &&
          hover.rows.map((row, s) =>
            row.value === null ? null : (
              <circle
                key={s}
                cx={hover.x}
                cy={y(row.value)}
                r={5}
                fill={row.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            ),
          )}
      </svg>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-line bg-surface-raised/95 px-2.5 py-2 text-[11.5px] shadow-pop backdrop-blur"
          style={{
            left: Math.min(hover.x + 12, width - 180),
            top: Math.max(4, Math.min(hover.y - 20, height - 30 - 20 * hover.rows.length)),
          }}
        >
          <div className="mb-1 truncate font-medium">{hover.title}</div>
          {hover.rows.map((row) => (
            <div key={row.name} className="flex items-center gap-2">
              <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
              <span className="min-w-0 flex-1 truncate text-fg-muted">{row.name}</span>
              <span className="font-medium tabular-nums">
                {row.value === null ? "—" : formatStat(row.value)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChartView({
  result,
  spec,
  onChange,
}: {
  result: QueryResult;
  spec: ChartSpec | null;
  onChange: (spec: ChartSpec) => void;
}) {
  const effective = spec ?? suggestChart(result.columns);
  const [ref, size] = useSize();
  const data = useMemo(
    () => (effective ? buildChartData(result.columns, result.rows, effective) : null),
    [result, effective],
  );
  const measures = measureColumns(result.columns);

  if (!effective || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-[12.5px] text-fg-muted">
        Nothing to chart: the result needs at least one numeric column besides the axis.
      </div>
    );
  }
  const limit = maxSeries(effective.type);
  const toggleMeasure = (index: number) => {
    const has = effective.y.includes(index);
    const y = has ? effective.y.filter((i) => i !== index) : [...effective.y, index].slice(-limit);
    if (y.length > 0) onChange({ ...effective, y });
  };
  const setType = (type: ChartType) =>
    onChange({ ...effective, type, y: effective.y.slice(0, maxSeries(type)) });
  const xOptions = result.columns.map((column, index) => ({ value: String(index), label: column.name }));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
        <Segmented<ChartType>
          size="sm"
          value={effective.type}
          onChange={setType}
          options={[
            { value: "bar", label: "Bar" },
            { value: "line", label: "Line" },
            { value: "area", label: "Area" },
            { value: "scatter", label: "Scatter" },
          ]}
        />
        <span className="ml-2 text-[11.5px] text-fg-subtle">X</span>
        <Select
          size="sm"
          value={String(effective.x)}
          onChange={(value) => {
            const x = Number(value);
            onChange({ ...effective, x, y: effective.y.filter((i) => i !== x).slice(0, limit) });
          }}
          options={xOptions}
          ariaLabel="X axis"
          className="max-w-40"
        />
        <span className="ml-2 text-[11.5px] text-fg-subtle">Y</span>
        <div className="flex flex-wrap gap-1">
          {measures
            .filter((index) => index !== effective.x)
            .map((index) => {
              const position = effective.y.indexOf(index);
              const active = position !== -1;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggleMeasure(index)}
                  className={cn(
                    "flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11.5px]",
                    active
                      ? "border-line-strong bg-surface-raised text-fg"
                      : "border-line text-fg-subtle hover:text-fg",
                  )}
                >
                  {active && (
                    <span className="size-2 rounded-full" style={{ background: seriesColor(position) }} />
                  )}
                  {result.columns[index]?.name}
                </button>
              );
            })}
        </div>
        <span className="flex-1" />
        {mixedScales(data) && (
          <span className="text-[11px] text-warning">
            These measures have very different scales: chart them one at a time.
          </span>
        )}
        {data.omitted > 0 && (
          <span className="text-[11px] text-fg-subtle">
            {data.omitted.toLocaleString("en-US")} rows not shown
            {axisKindOf(result.columns[effective.x]?.kind ?? "text") === "category"
              ? " (first 60 categories)"
              : ""}
          </span>
        )}
      </div>
      {data.series.length > 1 && (
        <div
          className="flex shrink-0 flex-wrap gap-3 px-4 pt-2 text-[11.5px] text-fg-muted"
          aria-label="Legend"
        >
          {data.series.map((name, i) => (
            <span key={name} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: seriesColor(i) }} />
              {name}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="min-h-0 flex-1 px-2 pb-2">
        {size.width > 0 && size.height > 0 && (
          <Plot data={data} type={effective.type} width={size.width} height={size.height} />
        )}
      </div>
    </div>
  );
}
