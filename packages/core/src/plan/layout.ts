import { contains, EPSILON, gapAlong, type Rect } from "../geometry/rect.ts";
import {
  copyLabel,
  formatIn,
  grainOk,
  materialName,
  placedRect,
  stockLabel,
  trimFor,
  usableRect,
  type PlanContext,
} from "./context.ts";
import { planError, planWarning, type PlanIssue, type PlanRef } from "./issues.ts";

interface Placed {
  ref: PlanRef;
  label: string;
  rect: Rect;
}

export function checkLayout(ctx: PlanContext): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const placedCopies = new Map<string, Set<number>>();
  const sheetsUsed = new Map<string, number>();

  (ctx.project.plan?.sheets ?? []).forEach((sheet, sheetIndex) => {
    const sheetName = `Sheet ${sheetIndex + 1}`;
    const stock = ctx.stock.get(sheet.stock);
    if (stock) sheetsUsed.set(stock.id, (sheetsUsed.get(stock.id) ?? 0) + 1);
    else issues.push(planError("bad-ref", `${sheetName} uses stock "${sheet.stock}", which does not exist.`, [{ kind: "sheet", sheet: sheet.id }]));

    const placed: Placed[] = [];
    sheet.placements.forEach((placement, index) => {
      const ref: PlanRef = { kind: "placement", sheet: sheet.id, index };
      const part = ctx.parts.get(placement.part);
      if (!part) {
        issues.push(planError("bad-ref", `${sheetName} places part "${placement.part}", which does not exist.`, [ref]));
        return;
      }
      if (placement.copy >= part.quantity) {
        issues.push(
          planError("bad-copy", `${sheetName} places copy ${placement.copy + 1} of ${part.name}, but its quantity is ${part.quantity}.`, [ref]),
        );
        return;
      }
      const label = copyLabel(part, placement.copy);
      const copies = placedCopies.get(part.id) ?? new Set<number>();
      if (copies.has(placement.copy)) {
        issues.push(planError("duplicate-placement", `${label} is placed more than once.`, [ref]));
        return;
      }
      copies.add(placement.copy);
      placedCopies.set(part.id, copies);

      const rect = placedRect(part, placement);
      placed.push({ ref, label, rect });
      if (!stock) return;
      if (part.material !== stock.material) {
        issues.push(
          planError("wrong-material", `${label} is ${materialName(ctx, part.material)}, but ${sheetName} is ${materialName(ctx, stock.material)}.`, [ref]),
        );
      }
      if (!grainOk(ctx, part, placement.rotated)) {
        issues.push(planError("grain", `${label} is turned so its grain runs across the sheet's grain.`, [ref]));
      }
      if (!contains(usableRect(ctx, stock), rect)) {
        const trim = trimFor(ctx, stock);
        const message = trim > 0 ? `${label} extends past the sheet or into the ${formatIn(ctx, trim)} edge trim.` : `${label} extends past the sheet.`;
        issues.push(planError("off-sheet", message, [ref]));
      }
    });

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const gapX = gapAlong(a.rect, b.rect, "x");
        const gapY = gapAlong(a.rect, b.rect, "y");
        if (gapX >= ctx.kerf - EPSILON || gapY >= ctx.kerf - EPSILON) continue;
        const message =
          gapX < -EPSILON && gapY < -EPSILON
            ? `${a.label} and ${b.label} overlap.`
            : `${a.label} and ${b.label} are closer than the ${formatIn(ctx, ctx.kerf)} kerf.`;
        issues.push(planError("overlap", message, [a.ref, b.ref]));
      }
    }
  });

  for (const [stockId, used] of sheetsUsed) {
    const stock = ctx.stock.get(stockId)!;
    if (stock.quantity === null || used <= stock.quantity) continue;
    issues.push(
      planError("stock-exceeded", `The plan uses ${used} sheets of ${stockLabel(ctx, stock)}, but only ${stock.quantity} ${stock.quantity === 1 ? "is" : "are"} available.`, [
        { kind: "stock", stock: stockId },
      ]),
    );
  }

  for (const part of ctx.project.parts) {
    const copies = placedCopies.get(part.id);
    const missing: number[] = [];
    for (let copy = 0; copy < part.quantity; copy++) if (!copies?.has(copy)) missing.push(copy);
    if (missing.length === 0) continue;
    const message =
      part.quantity === 1
        ? `${part.name} is not placed on any sheet.`
        : `${missing.length} of ${part.quantity} copies of ${part.name} are not placed on any sheet.`;
    issues.push(planWarning("unplaced", message, missing.map((copy) => ({ kind: "part", part: part.id, copy }))));
  }

  return issues;
}
