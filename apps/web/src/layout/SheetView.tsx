import {
  copyLabel,
  formatSize,
  grainOk,
  LIMIT_WORDS,
  NO_GROUP_COLOR,
  placedRect,
  sameCopy,
  stageColor,
  stockLabel,
  TOOL_WARNING_COLOR,
  TOOL_WARNING_FILL,
  toolWarning,
  usableRect,
  type CopyRef,
  type CutColoring,
  type PartColors,
  type PlanContext,
  type PlanSheet,
  type Rect,
  type Step,
  type ToolColors,
} from "@opencutplan/core";
import { Fragment, useId, type PointerEvent } from "react";
import { summaryItems, type SheetSummary } from "./sheetSummary.ts";
import type { Snapped } from "./snap.ts";

export interface DropPreview {
  rect: Rect;
  bad: boolean;
  guides: Snapped["guides"];
}

interface SheetViewProps {
  ctx: PlanContext;
  sheet: PlanSheet;
  number: number;
  scale: number;
  steps: readonly Step[];
  colors: PartColors;
  summary: SheetSummary;
  currency: string;
  cutColors: CutColoring;
  tools: ToolColors;
  /** Placement indices that an error refers to. */
  errors: ReadonlySet<number>;
  selected: CopyRef | null;
  dragging: CopyRef | null;
  preview: DropPreview | null;
  showCuts: boolean;
  showKerf: boolean;
  /** The snap grid in project units; 0 draws none. */
  grid: number;
  busy: boolean;
  onPartPointerDown(event: PointerEvent<SVGGElement>, ref: CopyRef): void;
  onSelect(ref: CopyRef): void;
  onTogglePin(): void;
  onRemove(): void;
  onOpenStep(step: number): void;
}

const GRID_MIN_PX = 6;

export function copyKey(ref: CopyRef): string {
  return `${ref.part}#${ref.copy}`;
}

/** The accessible name of a cut number, for example "Step 5, Table saw rip". */
export function cutName(step: Step): string {
  const what = step.tool ? `${step.tool.name} ${step.kind}` : `no tool, ${step.kind}`;
  return `Step ${step.step}, ${what}${step.overLimit ? `, over its ${LIMIT_WORDS[step.overLimit]}` : ""}`;
}

export function SheetView(props: SheetViewProps) {
  const { ctx, sheet, number, scale, steps, colors, summary, currency, cutColors, tools, errors, selected, dragging, preview, showCuts, showKerf, grid, busy } = props;
  const uid = useId();
  const stock = ctx.stock.get(sheet.stock);
  const px = (value: number) => value * scale;
  const guideAt = (value: number, size: number) => Math.min(Math.max(px(value), 1), px(size) - 1);
  const material = stock ? ctx.materials.get(stock.material) : undefined;
  const grained = ctx.features.grain && material?.grained === true;

  if (!stock) {
    return (
      <section className="sheet missing" aria-label={`Sheet ${number}`}>
        <p className="error">✖ Sheet {number} uses stock “{sheet.stock}”, which does not exist.</p>
        <button type="button" onClick={props.onRemove} disabled={busy}>
          Remove sheet
        </button>
      </section>
    );
  }

  const usable = usableRect(ctx, stock);
  const trim = usable.x;
  const gridPx = px(grid);
  const showGrid = gridPx >= GRID_MIN_PX;
  return (
    <section className="sheet" aria-label={`Sheet ${number}: ${stockLabel(ctx, stock)}`}>
      <header className="sheet-head">
        <span className="name">Sheet {number}</span>
        <button type="button" aria-pressed={sheet.pinned === true} onClick={props.onTogglePin} disabled={busy} title="A pinned sheet keeps its layout when you optimize.">
          {sheet.pinned ? "📌 Pinned" : "Pin"}
        </button>
        <button type="button" onClick={props.onRemove} disabled={busy} aria-label={`Remove sheet ${number}`}>
          Remove
        </button>
      </header>
      <p className="sheet-stock" title={stockLabel(ctx, stock)}>
        {stockLabel(ctx, stock)}
      </p>
      <p className="sheet-summary">
        {summaryItems(summary, currency).map((item, index) => (
          <Fragment key={index}>
            {index > 0 && " · "}
            <span>
              {cutColors === "tool" && item.tool !== undefined && (
                <span className="swatch" style={{ background: (item.tool !== null && tools.colorOf(item.tool)) || TOOL_WARNING_COLOR }} />
              )}
              {item.text}
            </span>
          </Fragment>
        ))}
      </p>
      <svg
        className="sheet-area"
        data-sheet={sheet.id}
        width={px(stock.length)}
        height={px(stock.width)}
        role="group"
        aria-label={`Sheet ${number} layout, ${formatSize(ctx, stock)}`}
      >
        <defs>
          <pattern id={`${uid}-h`} width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="0" y1="5.5" x2="6" y2="5.5" stroke="#00000022" />
          </pattern>
          <pattern id={`${uid}-v`} width="6" height="6" patternUnits="userSpaceOnUse">
            <line x1="5.5" y1="0" x2="5.5" y2="6" stroke="#00000022" />
          </pattern>
          {showGrid && (
            <pattern id={`${uid}-grid`} x={px(usable.x)} y={px(usable.y)} width={gridPx} height={gridPx} patternUnits="userSpaceOnUse">
              <path d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`} fill="none" stroke="#0000001a" />
            </pattern>
          )}
        </defs>
        <rect className="wood" x={0} y={0} width={px(stock.length)} height={px(stock.width)} />
        {grained && <rect x={0} y={0} width={px(stock.length)} height={px(stock.width)} fill={`url(#${uid}-h)`} />}
        {showGrid && <rect className="grid" x={px(usable.x)} y={px(usable.y)} width={px(usable.length)} height={px(usable.width)} fill={`url(#${uid}-grid)`} />}
        {trim > 0 && <rect className="trim" x={px(usable.x)} y={px(usable.y)} width={px(usable.length)} height={px(usable.width)} />}
        {sheet.placements.map((placement, index) => {
          const part = ctx.parts.get(placement.part);
          if (!part) return null;
          const ref = { part: placement.part, copy: placement.copy };
          const rect = placedRect(part, placement);
          const label = copyLabel(part, placement.copy);
          const colorKey = colors.keyOf(part, placement.copy);
          const bad = errors.has(index);
          const striped = grained && part.grain !== "none";
          const horizontal = (part.grain === "length") !== placement.rotated;
          const cross = striped && !grainOk(ctx, part, placement.rotated);
          const isSelected = sameCopy(selected, ref);
          const size = formatSize(ctx, rect);
          const w = px(rect.length);
          const h = px(rect.width);
          const font = Math.max(8, Math.min(12, h / 3));
          return (
            <g
              key={`${copyKey(ref)}@${index}`}
              className={`part${bad ? " bad" : ""}${isSelected ? " selected" : ""}${sameCopy(dragging, ref) ? " dragging" : ""}`}
              data-copy-key={copyKey(ref)}
              transform={`translate(${px(rect.x)} ${px(rect.y)})`}
              tabIndex={0}
              role="button"
              aria-pressed={isSelected}
              aria-label={`${label}, ${size}${placement.rotated ? ", turned" : ""}${cross ? ", across the grain" : ""}${bad ? ", has a problem" : ""}${colorKey ? `, ${colorKey.label}` : ""}`}
              onPointerDown={(event) => props.onPartPointerDown(event, ref)}
              onFocus={() => props.onSelect(ref)}
            >
              <rect className="fill" width={w} height={h} fill={colorKey?.color ?? NO_GROUP_COLOR} />
              {striped && <rect width={w} height={h} fill={`url(#${uid}-${horizontal ? "h" : "v"})`} />}
              <rect className="outline" width={w} height={h} />
              {w > 28 && h > 14 && (
                <text x={w / 2} y={h / 2} fontSize={font} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={w / 2} dy={h > 3 * font ? -font / 2 : 0}>
                    {bad ? "⚠ " : ""}
                    {label}
                    {cross ? " ⟂" : ""}
                  </tspan>
                  {h > 3 * font && (
                    <tspan x={w / 2} dy={font * 1.1} fontSize={font * 0.85}>
                      {size}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          );
        })}
        {showCuts &&
          steps.map((step) => {
            const [x1, y1, x2, y2] = step.axis === "x" ? [step.at, step.from, step.at, step.to] : [step.from, step.at, step.to, step.at];
            const byTool = cutColors === "tool";
            const color = byTool ? tools.cutColor(step) : stageColor(step.stage);
            const name = cutName(step);
            const mx = px((x1 + x2) / 2);
            const my = px((y1 + y2) / 2);
            const open = () => props.onOpenStep(step.step);
            return (
              <g key={step.step} className="cut" data-step={step.step}>
                <line
                  x1={px(x1)}
                  y1={px(y1)}
                  x2={px(x2)}
                  y2={px(y2)}
                  stroke={color}
                  strokeWidth={showKerf ? Math.max(1, px(ctx.kerf)) : 1.5}
                  strokeOpacity={showKerf ? 0.55 : 0.9}
                  strokeDasharray={step.kind === "trim" ? "4 3" : undefined}
                />
                <g
                  className="cut-number"
                  role="button"
                  tabIndex={0}
                  aria-label={name}
                  onClick={open}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    open();
                  }}
                >
                  <title>{`${name}, stage ${step.stage}. Open it on the Shop tab.`}</title>
                  <circle cx={mx} cy={my} r={8} fill={byTool && toolWarning(step) ? TOOL_WARNING_FILL : "#fff"} stroke={color} />
                  <text x={mx} y={my} fontSize={9} textAnchor="middle" dominantBaseline="central" fill={color}>
                    {step.step}
                  </text>
                </g>
              </g>
            );
          })}
        {preview && (
          <rect
            className={`drop-preview${preview.bad ? " bad" : ""}`}
            x={px(preview.rect.x)}
            y={px(preview.rect.y)}
            width={px(preview.rect.length)}
            height={px(preview.rect.width)}
          />
        )}
        {preview?.guides.x != null && (
          <line className="snap-guide" x1={guideAt(preview.guides.x, stock.length)} y1={0} x2={guideAt(preview.guides.x, stock.length)} y2={px(stock.width)} />
        )}
        {preview?.guides.y != null && (
          <line className="snap-guide" x1={0} y1={guideAt(preview.guides.y, stock.width)} x2={px(stock.length)} y2={guideAt(preview.guides.y, stock.width)} />
        )}
      </svg>
    </section>
  );
}
