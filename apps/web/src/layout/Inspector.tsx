import {
  copyLabel,
  findCopy,
  formatSize,
  materialName,
  placedRect,
  stockLabel,
  type CopyRef,
  type PlanContext,
  type Project,
} from "@opencutplan/core";
import { LengthInput } from "../components/fields.tsx";

interface InspectorProps {
  ctx: PlanContext;
  project: Project;
  selected: CopyRef | null;
  busy: boolean;
  message: string | null;
  onLocation(sheet: string | null): void;
  onMove(x: number, y: number): void;
  onRotate(): void;
}

const GRAIN_TEXT = { length: "along the length", width: "along the width", none: "none (may turn)" } as const;

export function Inspector({ ctx, project, selected, busy, message, onLocation, onMove, onRotate }: InspectorProps) {
  const part = selected ? ctx.parts.get(selected.part) : undefined;
  if (!selected || !part) {
    return (
      <section aria-labelledby="inspector-title">
        <h3 id="inspector-title">Selected part</h3>
        <p className="muted">Select a part on a sheet or in the tray. Keys: R turns it, Delete sends it to the tray, the arrow keys move it (Shift for bigger steps), Escape clears the selection.</p>
      </section>
    );
  }
  const found = findCopy(project, selected);
  const sheets = project.plan?.sheets ?? [];
  const rect = found ? placedRect(part, found.placement) : null;
  return (
    <section aria-labelledby="inspector-title">
      <h3 id="inspector-title">Selected part</h3>
      <p>
        <b>{copyLabel(part, selected.copy)}</b>
        <br />
        {formatSize(ctx, part)}, {materialName(ctx, part.material)}
        <br />
        Grain: {GRAIN_TEXT[part.grain]}
      </p>
      <label className="stack">
        Location
        <select value={found?.sheet.id ?? ""} disabled={busy} onChange={(event) => onLocation(event.target.value || null)}>
          <option value="">Unplaced tray</option>
          {sheets.map((sheet, index) => {
            const stock = ctx.stock.get(sheet.stock);
            const other = stock !== undefined && stock.material !== part.material;
            return (
              <option key={sheet.id} value={sheet.id}>
                Sheet {index + 1}
                {stock ? ` — ${stockLabel(ctx, stock)}` : ""}
                {other ? " (other material)" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {message && (
        <p role="status" className="error">
          {message}
        </p>
      )}
      {found && rect && (
        <>
          <div className="pair">
            <label className="stack">
              X (from the left)
              <LengthInput value={rect.x} units={ctx.units} allowZero disabled={busy} onChange={(x) => x !== undefined && onMove(x, rect.y)} />
            </label>
            <label className="stack">
              Y (from the top)
              <LengthInput value={rect.y} units={ctx.units} allowZero disabled={busy} onChange={(y) => y !== undefined && onMove(rect.x, y)} />
            </label>
          </div>
          <div className="buttons">
            <button type="button" onClick={onRotate} disabled={busy} aria-keyshortcuts="R">
              Turn (R)
            </button>
            <button type="button" onClick={() => onLocation(null)} disabled={busy} aria-keyshortcuts="Delete">
              To tray (Delete)
            </button>
          </div>
        </>
      )}
    </section>
  );
}
