import { slugify, uniqueId } from "../format/ids.ts";
import type { Project, Stock } from "../format/schema.ts";
import { EPSILON, type Rect } from "../geometry/rect.ts";
import { isOffcutSize, type PlanContext } from "../plan/context.ts";
import type { CutNode } from "../plan/cutTree.ts";
import type { SheetAnalysis } from "../plan/sheets.ts";

export interface Offcut {
  sheet: string;
  sheetNumber: number;
  stock: string;
  material: string;
  rect: Rect;
}

/** Waste pieces of the cut trees that are at least `minOffcut`. Sheets without placements have none. */
export function listOffcuts(ctx: PlanContext, sheets: readonly SheetAnalysis[]): Offcut[] {
  if (!ctx.features.offcuts) return [];
  const offcuts: Offcut[] = [];
  for (const { sheet, index, stock, items, tree } of sheets) {
    if (items.length === 0) continue;
    const visit = (node: CutNode): void => {
      if (node.kind === "split") node.children.forEach(visit);
      else if (node.kind === "waste" && isOffcutSize(ctx, node.rect)) {
        offcuts.push({ sheet: sheet.id, sheetNumber: index + 1, stock: stock.id, material: stock.material, rect: node.rect });
      }
    };
    visit(tree.root);
  }
  return offcuts;
}

function roundingSteps(project: Project): number {
  return project.project.units === "in" ? 64 : 10;
}

/** Offcut edges are all cut edges, so the new stock has no trim. Sizes round down to 1/64" or 0.1 mm. */
export function saveOffcutsToStock(project: Project, offcuts: readonly Offcut[]): Project {
  const steps = roundingSteps(project);
  const floor = (value: number) => Math.floor((value + EPSILON) * steps) / steps;
  const taken = new Set(project.stock.map((stock) => stock.id));
  const added = offcuts.map((offcut): Stock => {
    const id = uniqueId(slugify(`${offcut.material} offcut`), taken);
    taken.add(id);
    return {
      id,
      material: offcut.material,
      length: floor(offcut.rect.length),
      width: floor(offcut.rect.width),
      quantity: 1,
      cost: 0,
      kind: "offcut",
      trim: 0,
      name: `Offcut from ${project.project.name}, sheet ${offcut.sheetNumber}`,
    };
  });
  return { ...project, stock: [...project.stock, ...added] };
}

/**
 * The offcuts that "Save offcuts to stock" has not added yet. Stock of kind offcut counts as saved, once each, when it has
 * the same material, a name from the same sheet number, and the same size to within one rounding step: a unit change
 * rounds the saved size again, and a rename changes the project name in the stock name.
 */
export function unsavedOffcuts(project: Project, offcuts: readonly Offcut[]): Offcut[] {
  const tolerance = 1 / roundingSteps(project) + EPSILON;
  const saved = project.stock.filter((stock) => stock.kind === "offcut");
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;
  return offcuts.filter((offcut) => {
    const candidate = saveOffcutsToStock(project, [offcut]).stock.at(-1)!;
    const sheet = `, sheet ${offcut.sheetNumber}`;
    const index = saved.findIndex(
      (stock) =>
        stock.material === candidate.material &&
        stock.name?.startsWith("Offcut from ") === true &&
        stock.name.endsWith(sheet) &&
        near(stock.length, candidate.length) &&
        near(stock.width, candidate.width),
    );
    if (index === -1) return true;
    saved.splice(index, 1);
    return false;
  });
}
