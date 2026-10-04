import { addCatalogStock, CATALOG_FAMILIES, catalogFor, formatLength, projectStockFor, type Project } from "@opencutplan/core";
import { useState } from "react";
import { formatMoney } from "../reports/money.ts";
import { Dialog } from "./Dialog.tsx";

export const PRICE_NOTE = "Prices are typical: the lowest price on the store web sites on the date shown. Check the price before you buy.";

interface CatalogDialogProps {
  project: Project;
  onAdd(next: Project): void;
  onClose(): void;
}

export function CatalogDialog({ project, onAdd, onClose }: CatalogDialogProps) {
  const units = project.project.units;
  const display = project.settings.display;
  const currency = project.settings.currency;
  const [family, setFamily] = useState(CATALOG_FAMILIES[0]!);
  const materials = catalogFor(units, family);
  const [materialId, setMaterialId] = useState(materials[0]!.id);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const material = materials.find((entry) => entry.id === materialId) ?? materials[0]!;
  const show = (value: number) => formatLength(value, units, display);
  const picked = material.sizes.filter((size) => chosen.has(size.id));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
  };

  return (
    <Dialog title="Add from catalogue" onClose={onClose}>
      <p className="muted">Common sheet goods from Home Depot, Lowe&apos;s, and specialty sellers. {PRICE_NOTE}</p>
      <div className="pair">
        <label className="stack">
          Family
          <select
            value={family}
            onChange={(event) => {
              setFamily(event.target.value);
              setMaterialId(catalogFor(units, event.target.value)[0]!.id);
              setChosen(new Set());
            }}
          >
            {CATALOG_FAMILIES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="stack">
          Material
          <select
            value={material.id}
            onChange={(event) => {
              setMaterialId(event.target.value);
              setChosen(new Set());
            }}
          >
            {materials.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Actual thickness {formatLength(material.thickness, units, { inch: "decimal", mm: 0.1 })}, nominal {material.nominal}
        {material.grained ? ", grained" : ", no grain"}. <span className="muted">{material.notes}</span>
      </p>
      <table className="grid catalog-sizes">
        <thead>
          <tr>
            <th scope="col">Sheet size</th>
            <th scope="col">Actual size</th>
            <th scope="col">Typical price</th>
          </tr>
        </thead>
        <tbody>
          {material.sizes.map((size) => {
            const owned = projectStockFor(project, size.id) !== undefined;
            return (
              <tr key={size.id}>
                <th scope="row">
                  <label className="inline">
                    <input type="checkbox" disabled={owned} checked={owned || chosen.has(size.id)} onChange={(event) => toggle(size.id, event.target.checked)} />
                    {size.label}
                  </label>
                </th>
                <td>
                  {show(size.length)} × {show(size.width)}
                </td>
                <td>
                  {size.price ? (
                    <>
                      {formatMoney(size.price.usd, "USD")}{" "}
                      <span className="muted">
                        (
                        <a href={size.price.source} target="_blank" rel="noreferrer">
                          {size.price.store}
                        </a>
                        , checked {size.price.checked})
                      </span>
                    </>
                  ) : (
                    <span className="muted">No price found.</span>
                  )}
                  {owned && <span className="muted"> In the project.</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {currency !== "USD" && <p className="muted">The project currency is {currency}. The prices are in USD, so the new stock gets no cost.</p>}
      <footer className="dialog-foot">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={picked.length === 0}
          onClick={() => onAdd(picked.reduce((next, size) => addCatalogStock(next, size.id).project, project))}
        >
          Add {picked.length} {picked.length === 1 ? "size" : "sizes"}
        </button>
      </footer>
    </Dialog>
  );
}
