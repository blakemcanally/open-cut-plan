import { formatIn, type CutOrder, type PlanContext, type Step } from "@opencutplan/core";
import { useState } from "react";
import { KIND_NAMES } from "./cutEditing.ts";

interface CutOrderListProps {
  ctx: PlanContext;
  /** The cuts of the sheet without the trims, in the sheet order. */
  steps: Step[];
  selected: Step;
  busy: boolean;
  /** True when the order mode is "setup", so that the sequence does not use this order. */
  setup: boolean;
  note: string | null;
  limitsFor(step: Step): CutOrder | null;
  onMove(step: Step, to: number): void;
  onSelect(step: Step): void;
}

/** The cut order of the sheet of the selected cut. A drag moves a cut to the place of the cut that it drops on, inside its limits. */
export function CutOrderList({ ctx, steps, selected, busy, setup, note, limitsFor, onMove, onSelect }: CutOrderListProps) {
  const [drag, setDrag] = useState<{ from: number; limits: CutOrder } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const outside = (i: number) => drag !== null && i !== drag.from && (i < drag.limits.min || i > drag.limits.max);
  const end = () => {
    setDrag(null);
    setOver(null);
  };
  return (
    <div className="cut-order">
      <h4>Cut order</h4>
      <p className="muted">
        Drag a cut, or press Alt+Up or Alt+Down, to move the selected cut. A cut stays after the cut that makes its piece and before the first cut inside that piece.
      </p>
      {setup && <p className="muted">The order mode is Setup, so the Shop tab groups the cuts by setup. This order applies in the Sheet order mode.</p>}
      <ol aria-label="Cut order">
        {steps.map((step, i) => {
          const isSelected = step.step === selected.step;
          const classes = [isSelected ? "selected" : "", outside(i) ? "out-of-limits" : "", over === i ? "drop-target" : "", drag?.from === i ? "dragging" : ""].filter(Boolean).join(" ");
          return (
            <li key={step.step}>
              <button
                type="button"
                className={classes || undefined}
                data-order-step={step.step}
                aria-current={isSelected ? "true" : undefined}
                draggable={!busy}
                onClick={() => onSelect(step)}
                onDragStart={(event) => {
                  const limits = limitsFor(step);
                  if (!limits) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer?.setData("text/plain", String(step.step));
                  setDrag({ from: i, limits });
                  if (!isSelected) onSelect(step);
                }}
                onDragOver={(event) => {
                  if (!drag || i === drag.from || outside(i)) return;
                  event.preventDefault();
                  setOver(i);
                }}
                onDragLeave={() => over === i && setOver(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  if (drag && i !== drag.from && !outside(i)) onMove(steps[drag.from]!, i);
                  end();
                }}
                onDragEnd={end}
              >
                <span className="order-number">{step.step}</span> {KIND_NAMES[step.kind]} at {formatIn(ctx, step.at)}, {formatIn(ctx, step.to - step.from)}
              </button>
            </li>
          );
        })}
      </ol>
      {note && (
        <p className="muted" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
