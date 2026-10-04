import {
  copyLabel,
  formatSize,
  materialName,
  sameCopy,
  type CopyRef,
  type PartColors,
  type PlanContext,
  type UnplacedReason,
} from "@opencutplan/core";
import type { PointerEvent } from "react";
import { copyKey } from "./SheetView.tsx";

export const REASON_TEXT: Readonly<Record<UnplacedReason, string>> = {
  "too-large": "larger than every enabled stock",
  "no-stock": "no stock left",
  "no-tool": "no tool can make its cuts",
  "not-guillotine": "cannot be cut free",
};

interface TrayProps {
  ctx: PlanContext;
  copies: readonly CopyRef[];
  colors: PartColors;
  reasons: ReadonlyMap<string, UnplacedReason>;
  selected: CopyRef | null;
  dropping: boolean;
  onPointerDown(event: PointerEvent<HTMLButtonElement>, ref: CopyRef): void;
  onSelect(ref: CopyRef): void;
}

export function Tray({ ctx, copies, colors, reasons, selected, dropping, onPointerDown, onSelect }: TrayProps) {
  const byMaterial = new Map<string, CopyRef[]>();
  for (const ref of copies) {
    const material = ctx.parts.get(ref.part)?.material ?? "";
    byMaterial.set(material, [...(byMaterial.get(material) ?? []), ref]);
  }
  return (
    <section className={`tray${dropping ? " dropping" : ""}`} data-tray="" aria-labelledby="tray-title">
      <h3 id="tray-title">
        Unplaced parts <span className="muted">({copies.length})</span>
      </h3>
      {copies.length === 0 && <p className="muted">Every part is on a sheet.</p>}
      {[...byMaterial].map(([material, refs]) => (
        <div key={material} className="tray-group">
          <h4>{materialName(ctx, material)}</h4>
          <ul>
            {refs.map((ref) => {
              const part = ctx.parts.get(ref.part)!;
              const reason = reasons.get(copyKey(ref));
              return (
                <li key={copyKey(ref)}>
                  <button
                    type="button"
                    className="tray-part"
                    data-copy-key={copyKey(ref)}
                    aria-pressed={sameCopy(selected, ref)}
                    onPointerDown={(event) => onPointerDown(event, ref)}
                    onClick={() => onSelect(ref)}
                    onFocus={() => onSelect(ref)}
                  >
                    <span className="swatch" title={colors.keyOf(part, ref.copy)?.label} style={{ background: colors.colorOf(part, ref.copy) }} />
                    <b>{copyLabel(part, ref.copy)}</b> <span>{formatSize(ctx, part)}</span>
                    {reason && <span className="reason"> ⚠ {REASON_TEXT[reason]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
