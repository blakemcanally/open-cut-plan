import {
  copyLabel,
  formatSize,
  hasEnabledStock,
  materialName,
  sameCopy,
  suggestedStock,
  type CopyRef,
  type PartColors,
  type PlanContext,
  type UnplacedReason,
} from "@opencutplan/core";
import type { PointerEvent } from "react";
import { formatMoney } from "../reports/money.ts";
import { copyKey } from "./SheetView.tsx";

export const REASON_TEXT: Readonly<Record<UnplacedReason, string>> = {
  "no-stock-for-material": "its material has no stock",
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
  onAddStock?(material: string): void;
}

function StockNote({ ctx, material, onAddStock }: { ctx: PlanContext; material: string; onAddStock(material: string): void }) {
  const name = materialName(ctx, material);
  const stock = suggestedStock(ctx.project, material);
  const id = `tray-stock-${material}`;
  return (
    <p className="warning">
      ⚠ {name} has no stock.{" "}
      <button type="button" aria-label={`Add stock for ${name}`} aria-describedby={id} onClick={() => onAddStock(material)}>
        Add stock
      </button>{" "}
      <span id={id} className="muted">
        Adds unlimited {formatSize(ctx, stock)} sheets {stock.cost === undefined ? "with no price" : `at ${formatMoney(stock.cost, ctx.project.settings.currency)} each`}.
      </span>
    </p>
  );
}

export function Tray({ ctx, copies, colors, reasons, selected, dropping, onPointerDown, onSelect, onAddStock }: TrayProps) {
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
      {[...byMaterial].map(([material, refs]) => {
        const stockless = ctx.materials.has(material) && !hasEnabledStock(ctx.project, material);
        return (
          <div key={material} className="tray-group">
            <h4>{materialName(ctx, material)}</h4>
            {stockless && onAddStock && <StockNote ctx={ctx} material={material} onAddStock={onAddStock} />}
            <ul>
              {refs.map((ref) => {
                const part = ctx.parts.get(ref.part)!;
                const ran = reasons.get(copyKey(ref));
                const reason = stockless ? "no-stock-for-material" : ran === "no-stock-for-material" ? undefined : ran;
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
        );
      })}
    </section>
  );
}
