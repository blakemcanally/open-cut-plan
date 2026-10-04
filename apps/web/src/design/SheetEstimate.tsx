import {
  addCatalogStock,
  catalogFor,
  designSheetEstimate,
  formatLength,
  NEW_SHEET_SIZE,
  projectMaterialFor,
  slugify,
  uniqueId,
  type Design,
  type Project,
  type SheetEstimate as Estimate,
} from "@opencutplan/core";
import { useDeferredValue, useMemo } from "react";

interface SheetEstimateProps {
  project: Project;
  /** The design as drawn, with the text in a field that has not committed yet. */
  design: Design;
  disabled: boolean;
  onEdit(next: Project): void;
  onOptimize?: (() => void) | undefined;
  optimizing?: boolean;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function SheetEstimate({ project, design, disabled, onEdit, onOptimize, optimizing = false }: SheetEstimateProps) {
  const deferredProject = useDeferredValue(project);
  const deferredDesign = useDeferredValue(design);
  const estimate = useMemo(() => {
    const designs = (deferredProject.designs ?? []).map((item) => (item.id === deferredDesign.id ? deferredDesign : item));
    return designSheetEstimate({ ...deferredProject, designs }, deferredDesign);
  }, [deferredProject, deferredDesign]);
  if (!estimate) return null;

  const units = project.project.units;
  const display = project.settings.display;
  const show = (value: number) => formatLength(value, units, display);
  const materialText = (id: string) => {
    const material = project.materials.find((item) => item.id === id);
    return material ? `${material.name} (${show(material.thickness)})` : id;
  };
  const sheet = NEW_SHEET_SIZE[units];
  const addSheet = (material: string) => {
    const id = uniqueId(slugify(`${material} ${sheet.length}x${sheet.width}`), new Set(project.stock.map((stock) => stock.id)));
    onEdit({ ...project, stock: [...project.stock, { id, material, ...sheet, quantity: null, kind: "sheet" }] });
  };
  const sizesText = (entry: Estimate) =>
    entry.sizes.length === 1
      ? `, ${show(entry.sizes[0]!.length)} × ${show(entry.sizes[0]!.width)}`
      : `: ${entry.sizes.map((size) => `${size.count} of ${show(size.length)} × ${show(size.width)}`).join(", ")}`;

  return (
    <section aria-labelledby="design-sheets-title">
      <h3 id="design-sheets-title">Sheets</h3>
      <ul className="sheet-estimate">
        {estimate.map((entry) => {
          if (entry.noStock) {
            const match = catalogFor(units).find((item) => projectMaterialFor(project, item.id)?.id === entry.material);
            const size = match?.sizes[0];
            return (
              <li key={entry.material} className="warning">
                ⚠ The project has no sheet stock of {materialText(entry.material)}.{" "}
                {size ? (
                  <button type="button" disabled={disabled} onClick={() => onEdit(addCatalogStock(project, size.id).project)}>
                    Add {size.label} sheets from the catalogue
                  </button>
                ) : (
                  <>
                    <button type="button" disabled={disabled} onClick={() => addSheet(entry.material)}>
                      Add {show(sheet.length)} × {show(sheet.width)} sheets
                    </button>{" "}
                    Or choose a catalogue material in the Material list.
                  </>
                )}
              </li>
            );
          }
          return (
            <li key={entry.material}>
              About <b>{plural(entry.sheets, "sheet")}</b> of {materialText(entry.material)}
              {entry.sizes.length > 0 && sizesText(entry)}.
              {entry.unplaced > 0 && ` ${plural(entry.unplaced, "piece")} ${entry.unplaced === 1 ? "does" : "do"} not fit on these sheets.`}
            </li>
          );
        })}
      </ul>
      <p className="muted">An estimate from a short optimizer run on the parts of this design alone. The full plan can use a different number.</p>
      {onOptimize && (
        <button type="button" className="primary" disabled={disabled || optimizing} title="Plan every part of the project, then show the Layout tab." onClick={onOptimize}>
          Optimize now
        </button>
      )}
    </section>
  );
}
