import { formatIn, type CutEnd, type PlanContext, type Step } from "@opencutplan/core";
import { useState, type PointerEvent } from "react";
import type { EndStop } from "./cutEditing.ts";

const SNAP_PX = 16;
const TICK_PX = 9;

interface CutEditorProps {
  ctx: PlanContext;
  step: Step;
  scale: number;
  busy: boolean;
  /** The cuts on the same line that Join adds, or 0 when there is no join. */
  joins: number;
  stopsFor(end: CutEnd): EndStop[];
  onStop(end: CutEnd, stop: EndStop): void;
  onJoin(): void;
}

interface EndDrag {
  end: CutEnd;
  stops: EndStop[];
  value: number;
}

/** The selected cut on the sheet: a thick line, a handle at each end to drag to a stop, and the Join chip. */
export function CutEditor({ ctx, step, scale, busy, joins, stopsFor, onStop, onJoin }: CutEditorProps) {
  const [drag, setDrag] = useState<EndDrag | null>(null);
  const px = (value: number) => value * scale;
  const point = (along: number): [number, number] => (step.axis === "x" ? [px(step.at), px(along)] : [px(along), px(step.at)]);
  const valueAt = (event: PointerEvent<SVGElement>) => {
    const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    return (step.axis === "x" ? event.clientY - box.top : event.clientX - box.left) / scale;
  };
  const nearest = (current: EndDrag) => {
    let best: EndStop | null = null;
    for (const stop of current.stops) if (!best || Math.abs(stop.end - current.value) < Math.abs(best.end - current.value)) best = stop;
    return best && Math.abs(best.end - current.value) * scale <= SNAP_PX ? best : null;
  };

  const handle = (end: CutEnd) => {
    const value = end === "from" ? step.from : step.to;
    const [cx, cy] = point(drag?.end === end ? drag.value : value);
    return (
      <circle
        key={end}
        className={`cut-handle${drag?.end === end ? " dragging" : ""}`}
        data-end={end}
        cx={cx}
        cy={cy}
        r={6}
        aria-hidden="true"
        onPointerDown={(event) => {
          if (busy || event.button !== 0) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setDrag({ end, stops: stopsFor(end), value });
        }}
        onPointerMove={(event) => drag?.end === end && setDrag({ ...drag, value: valueAt(event) })}
        onPointerUp={() => {
          if (!drag) return;
          const stop = nearest(drag);
          setDrag(null);
          if (stop) onStop(drag.end, stop);
        }}
        onPointerCancel={() => setDrag(null)}
      />
    );
  };

  const fixed = drag ? (drag.end === "from" ? step.to : step.from) : null;
  const snapped = drag ? nearest(drag) : null;
  const [x1, y1] = point(step.from);
  const [x2, y2] = point(step.to);
  const [mx, my] = point((step.from + step.to) / 2);
  const chip = `Join ${joins + 1} cuts`;
  return (
    <g className="cut-editor" data-selected-step={step.step}>
      <line className="cut-selected" x1={x1} y1={y1} x2={x2} y2={y2} />
      {drag && fixed !== null && (
        <>
          <line className="cut-ghost" x1={point(fixed)[0]} y1={point(fixed)[1]} x2={point(drag.value)[0]} y2={point(drag.value)[1]} />
          {drag.stops.map((stop) => {
            const [sx, sy] = point(stop.end);
            const [dx, dy] = step.axis === "x" ? [TICK_PX, 0] : [0, TICK_PX];
            return (
              <line
                key={`${stop.kind}-${stop.end}`}
                className={`cut-stop${stop.noTool ? " no-tool" : ""}${snapped === stop ? " near" : ""}`}
                data-stop={stop.end}
                x1={sx - dx}
                y1={sy - dy}
                x2={sx + dx}
                y2={sy + dy}
              />
            );
          })}
          {(() => {
            const [lx, ly] = point(drag.value);
            const text = snapped ? `→ ${formatIn(ctx, Math.abs(snapped.end - fixed))}` : "No stop";
            return (
              <text className="cut-stop-label" x={lx + 10} y={ly - 10}>
                {text}
              </text>
            );
          })()}
        </>
      )}
      {handle("from")}
      {handle("to")}
      {joins > 0 && !drag && (
        <g
          className="join-chip"
          role="button"
          tabIndex={0}
          aria-label={chip}
          aria-disabled={busy}
          transform={`translate(${mx + 12} ${my + 12})`}
          onClick={() => !busy && onJoin()}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (!busy) onJoin();
          }}
        >
          <rect width={chip.length * 6.5 + 16} height={20} rx={10} />
          <text x={8} y={14}>
            {chip}
          </text>
        </g>
      )}
    </g>
  );
}
