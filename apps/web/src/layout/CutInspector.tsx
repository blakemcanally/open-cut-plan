import { formatIn, type CutEnd, type PlanContext, type Step } from "@opencutplan/core";
import { toolOption } from "../shop/toolOption.ts";
import { endName, type EndStop } from "./cutEditing.ts";

interface CutInspectorProps {
  ctx: PlanContext;
  step: Step | null;
  busy: boolean;
  /** The cuts of the sheet now, and before the last cut edit of this sheet. */
  count: { sheet: number; cuts: number; before: number | null } | null;
  stops: Record<CutEnd, EndStop[]> | null;
  joins: number;
  canRemove: boolean;
  locked: boolean;
  onStop(end: CutEnd, stop: EndStop): void;
  onJoin(): void;
  onRemove(): void;
  onLock(): void;
  onTool(tool: string): void;
}

const KIND_NAMES = { rip: "Rip", crosscut: "Crosscut", trim: "Trim" } as const;

export function CutInspector({ ctx, step, busy, count, stops, joins, canRemove, locked, onStop, onJoin, onRemove, onLock, onTool }: CutInspectorProps) {
  const total = count && (
    <p className="muted" role="status">
      Sheet {count.sheet}: {count.cuts} cuts{count.before !== null && count.before !== count.cuts ? ` (was ${count.before})` : ""}.
    </p>
  );
  if (!step || !stops) {
    return (
      <section aria-labelledby="inspector-title">
        <h3 id="inspector-title">Selected cut</h3>
        <p className="muted">Select a cut on a sheet. Drag an end of the selected cut to a green stop to make it longer or shorter. The parts do not move in this mode. Escape clears the selection.</p>
        {total}
      </section>
    );
  }
  const first = (end: CutEnd, kind: EndStop["kind"]) => stops[end].find((stop) => stop.kind === kind);
  return (
    <section aria-labelledby="inspector-title">
      <h3 id="inspector-title">Selected cut</h3>
      <p>
        <b>
          Cut {step.step} · {KIND_NAMES[step.kind]} · stage {step.stage}
          {locked && " · locked"}
        </b>
        <br />
        At {formatIn(ctx, step.at)}, from {formatIn(ctx, step.from)} to {formatIn(ctx, step.to)}
        <br />
        Length {formatIn(ctx, step.to - step.from)}
      </p>
      <label className="stack">
        Tool
        <select value={step.tool?.id ?? ""} disabled={busy} onChange={(event) => onTool(event.target.value)}>
          {step.tool === null && <option value="">No tool</option>}
          {ctx.tools.map((tool) => (
            <option key={tool.id} value={tool.id}>
              {toolOption(step, tool, ctx.features.toolLimits)}
            </option>
          ))}
        </select>
      </label>
      {(["from", "to"] as const).map((end) => {
        const name = endName(step.axis, end);
        const extend = first(end, "extend");
        const shorten = first(end, "shorten");
        return (
          <div key={end} className="cut-end" role="group" aria-label={`The ${name} end`}>
            <span className="muted">{name[0]!.toUpperCase() + name.slice(1)} end</span>
            <button type="button" disabled={busy || !extend} aria-label={`Extend the ${name} end`} onClick={() => extend && onStop(end, extend)}>
              Extend
            </button>
            <button type="button" disabled={busy || !shorten} aria-label={`Shorten the ${name} end`} onClick={() => shorten && onStop(end, shorten)}>
              Shorten
            </button>
          </div>
        );
      })}
      <div className="cut-actions">
        <button type="button" aria-pressed={locked} disabled={busy} onClick={onLock} title="Optimize cuts keeps a locked cut. Press L to lock or unlock.">
          Lock
        </button>
        {joins > 0 && (
          <button type="button" disabled={busy} onClick={onJoin}>
            Join {joins + 1} cuts
          </button>
        )}
        <button type="button" disabled={busy || !canRemove} onClick={onRemove} title="Removes a cut that the parts do not need, such as a cut through waste.">
          Remove
        </button>
      </div>
      {total}
      {locked && <p className="muted">This cut is locked: it cannot change, and Optimize cuts keeps it. Unlock it to change it.</p>}
      <p className="muted">The parts are locked in this mode. Escape clears the selection.</p>
    </section>
  );
}
