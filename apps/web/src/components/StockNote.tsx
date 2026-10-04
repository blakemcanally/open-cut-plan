import { formatSize, materialName, planContext, stocklessMaterials, suggestedStock, type Project } from "@opencutplan/core";
import { useId } from "react";
import { formatMoney } from "../reports/money.ts";

interface StockNoteProps {
  project: Project;
  material: string;
  onAdd(material: string): void;
}

/** Says that the material has no stock, and offers its suggested sheet. */
export function StockNote({ project, material, onAdd }: StockNoteProps) {
  const id = useId();
  const ctx = planContext(project);
  const name = materialName(ctx, material);
  const stock = suggestedStock(project, material);
  return (
    <p className="warning stock-note">
      ⚠ {name} has no stock.{" "}
      <button type="button" aria-label={`Add stock for ${name}`} aria-describedby={id} onClick={() => onAdd(material)}>
        Add stock
      </button>{" "}
      <span id={id} className="muted">
        Adds unlimited {formatSize(ctx, stock)} sheets {stock.cost === undefined ? "with no price" : `at ${formatMoney(stock.cost, project.settings.currency)} each`}.
      </span>
    </p>
  );
}

/** A StockNote for each material that parts use and that has no enabled stock. */
export function StocklessNotes({ project, onAdd }: { project: Project; onAdd(material: string): void }) {
  return stocklessMaterials(project).map((material) => <StockNote key={material.id} project={project} material={material.id} onAdd={onAdd} />);
}
