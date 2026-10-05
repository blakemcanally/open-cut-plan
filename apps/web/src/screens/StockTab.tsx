import {
  addMaterial,
  errorMessage,
  addStock,
  addSuggestedStock,
  DEFAULT_TRIM,
  formatLength,
  materialColor,
  materialStatus,
  materialStatusText,
  nominalThickness,
  nominalThicknessText,
  planContext,
  removeMaterial,
  removeStock,
  updateMaterial,
  stockLabel,
  updateStock,
  type MaterialStatus,
  type Stock,
  type StockKind,
  type Units,
} from "@opencutplan/core";
import { useId, useState } from "react";
import { CatalogDialog } from "../components/CatalogDialog.tsx";
import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { AddStock } from "../components/StockNote.tsx";
import { ThicknessPicker } from "../components/ThicknessPicker.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { chooseFile } from "../storage/files.ts";
import { isTableText } from "./PartsTab.tsx";

type EdgeChoice = "project" | "use" | "trim";

function edgeChoice(stock: Stock): EdgeChoice {
  return stock.trim === undefined ? "project" : stock.trim === 0 ? "use" : "trim";
}

function trimForChoice(choice: EdgeChoice, stock: Stock, projectTrim: number, units: Units): number | undefined {
  if (choice === "project") return undefined;
  if (choice === "use") return 0;
  if (stock.trim !== undefined && stock.trim > 0) return stock.trim;
  return projectTrim > 0 ? projectTrim : DEFAULT_TRIM[units];
}

/** Why a material cannot be deleted, for example "Parts and stock use this material. Change them first." */
function inUseText(status: MaterialStatus): string {
  const users = [status.parts > 0 && "parts", status.stock > 0 && "stock", status.designs === 1 ? "a design" : status.designs > 1 && "designs"].filter((user) => user !== false);
  const single = users.length === 1 && (users[0] === "stock" || users[0] === "a design");
  const list = users.length > 2 ? `${users.slice(0, -1).join(", ")}, and ${users.at(-1)}` : users.join(" and ");
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${single ? "uses" : "use"} this material. Change ${single ? "it" : "them"} first.`;
}

function DeleteMaterial({ name, status, onDelete }: { name: string; status: MaterialStatus; onDelete(): void }) {
  const id = useId();
  const used = status.parts > 0 || status.stock > 0 || status.designs > 0;
  if (!used) {
    return (
      <button type="button" aria-label={`Delete material ${name}`} onClick={onDelete}>
        Delete
      </button>
    );
  }
  return (
    <span className="has-tip">
      <button type="button" aria-label={`Delete material ${name}`} aria-disabled="true" aria-describedby={id}>
        Delete
      </button>
      <span id={id} role="tooltip" className="tip">
        {inUseText(status)}
      </span>
    </span>
  );
}

export function StockTab({ store }: { store: ProjectStore }) {
  const { project, edit } = store;
  const ctx = planContext(project);
  const [importing, setImporting] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const units = project.project.units;
  const display = project.settings.display;
  const currency = project.settings.currency;
  const { features, trim: projectTrim } = project.settings;
  const projectEdges = !features.trim || projectTrim === 0 ? "Project: use factory edges" : `Project: trim ${formatLength(projectTrim, units, display)}`;

  const importFile = async () => {
    setReadError(null);
    try {
      const file = await chooseFile(".csv,.tsv,.txt,text/csv");
      if (file) setImporting(await file.text());
    } catch (e) {
      setReadError(`The file could not be read: ${errorMessage(e)}`);
    }
  };

  return (
    <div
      className="stock-tab"
      onPaste={(event) => {
        const text = event.clipboardData.getData("text/plain");
        if (!isTableText(text)) return;
        event.preventDefault();
        setImporting(text);
      }}
    >
      <section aria-labelledby="materials-title">
        <div className="toolbar">
          <h2 id="materials-title">Materials</h2>
          <button type="button" onClick={() => edit(addMaterial)}>
            Add material
          </button>
        </div>
        {project.materials.length === 0 ? (
          <p className="muted">No materials yet. Adding stock or parts adds one.</p>
        ) : (
          <table className="grid cards" aria-labelledby="materials-title">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Thickness</th>
                <th scope="col">Grained</th>
                <th scope="col">Colour</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.materials.map((material) => {
                const status = materialStatus(project, material.id);
                const stockless = status.parts > 0 && status.sizes === 0;
                const nominal = nominalThickness(project, material.id);
                const nominalText = nominalThicknessText(project, material.id);
                const warn = stockless || status.unpriced > 0;
                return (
                  <tr key={material.id}>
                    <td data-label="Name" className="wide">
                      <TextInput aria-label={`Name of material ${material.name}`} value={material.name} required onChange={(name) => edit((p) => updateMaterial(p, material.id, { name }))} />
                    </td>
                    <td data-label="Thickness">
                      <div className="thickness-field">
                        <LengthInput
                          aria-label={`Thickness of ${material.name}`}
                          value={material.thickness}
                          units={units}
                          onChange={(thickness) => thickness !== undefined && edit((p) => updateMaterial(p, material.id, { thickness }))}
                        />
                        <ThicknessPicker name={material.name} value={material.thickness} units={units} onPick={(thickness) => edit((p) => updateMaterial(p, material.id, { thickness, measured: true }))} />
                        {(nominal !== null || material.measured === true) && (
                          <label className="measured">
                            <input
                              type="checkbox"
                              aria-label={`${material.name} thickness is measured`}
                              checked={material.measured === true}
                              onChange={(event) => edit((p) => updateMaterial(p, material.id, { measured: event.target.checked ? true : undefined }))}
                            />
                            Measured
                          </label>
                        )}
                      </div>
                    </td>
                    <td data-label="Grained">
                      <input
                        type="checkbox"
                        aria-label={`${material.name} has grain`}
                        checked={material.grained}
                        onChange={(event) => edit((p) => updateMaterial(p, material.id, { grained: event.target.checked }))}
                      />
                    </td>
                    <td data-label="Colour">
                      <input
                        type="color"
                        aria-label={`Colour of ${material.name}`}
                        value={materialColor(project, material.id)}
                        onChange={(event) => edit((p) => updateMaterial(p, material.id, { color: event.target.value }), `material-color:${material.id}`)}
                      />
                    </td>
                    <td data-label="Status" className={`material-status wide${warn || nominalText !== null ? " warning" : ""}`}>
                      {warn && "⚠ "}
                      {materialStatusText(status)}
                      {stockless && (
                        <>
                          {" "}
                          <AddStock project={project} material={material.id} onAdd={(id) => edit((p) => addSuggestedStock(p, id).project)} />
                        </>
                      )}
                      {nominalText !== null && <div className="nominal-warning">⚠ {nominalText} Measure it, or pick it from the list.</div>}
                    </td>
                    <td className="actions">
                      <DeleteMaterial name={material.name} status={status} onDelete={() => edit((p) => removeMaterial(p, material.id))} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="stock-title">
        <div className="toolbar">
          <h2 id="stock-title">Stock</h2>
          <button type="button" className="primary" onClick={() => edit(addStock)}>
            Add stock
          </button>
          <button type="button" onClick={() => setBrowsing(true)}>
            Add from catalogue…
          </button>
          <button type="button" onClick={() => setImporting("")}>
            Paste rows…
          </button>
          <button
            type="button"
            onClick={() => void importFile()}
          >
            Import CSV…
          </button>
        </div>
        {readError && (
          <p role="alert" className="error">
            ✖ {readError}
          </p>
        )}
        {project.stock.length === 0 ? (
          <p className="muted">No stock yet. Add the sheets you can buy and the offcuts you own, or add common sheet goods from the catalogue.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid cards" aria-labelledby="stock-title">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Material</th>
                  <th scope="col">Length</th>
                  <th scope="col">Width</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Cost ({currency})</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Edges</th>
                  <th scope="col">Use</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {project.stock.map((stock) => {
                  const label = stockLabel(ctx, stock);
                  const change = (patch: Parameters<typeof updateStock>[2]) => edit((p) => updateStock(p, stock.id, patch));
                  return (
                    <tr key={stock.id}>
                      <td data-label="Name" className="wide">
                        <TextInput aria-label={`Name of stock ${label}`} className="stock-name" placeholder={label} value={stock.name ?? ""} onChange={(name) => change({ name: name || undefined })} />
                      </td>
                      <td data-label="Material">
                        <select aria-label={`Material of stock ${label}`} value={stock.material} onChange={(event) => change({ material: event.target.value })}>
                          {project.materials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Length">
                        <LengthInput aria-label={`Length of stock ${label}`} value={stock.length} units={units} onChange={(length) => length !== undefined && change({ length })} />
                      </td>
                      <td data-label="Width">
                        <LengthInput aria-label={`Width of stock ${label}`} value={stock.width} units={units} onChange={(width) => width !== undefined && change({ width })} />
                      </td>
                      <td data-label="Qty">
                        <NumberInput
                          aria-label={`Quantity of stock ${label}`}
                          className="narrow"
                          placeholder="Unlimited"
                          value={stock.quantity ?? undefined}
                          integer
                          minimum={1}
                          optional
                          onChange={(quantity) => change({ quantity: quantity ?? null })}
                        />
                      </td>
                      <td data-label={`Cost (${currency})`}>
                        <NumberInput aria-label={`Cost of stock ${label}`} className="narrow" value={stock.cost} optional onChange={(cost) => change({ cost })} />
                      </td>
                      <td data-label="Kind">
                        <select aria-label={`Kind of stock ${label}`} value={stock.kind} onChange={(event) => change({ kind: event.target.value as StockKind })}>
                          <option value="sheet">Sheet to buy</option>
                          <option value="offcut">Offcut I own</option>
                        </select>
                      </td>
                      <td data-label="Edges" className="wide">
                        <span className="inline">
                          <select
                            aria-label={`Edges of stock ${label}`}
                            value={edgeChoice(stock)}
                            disabled={!features.trim}
                            title={features.trim ? undefined : "Choose Trim each edge on the Settings tab to use this."}
                            onChange={(event) => change({ trim: trimForChoice(event.target.value as EdgeChoice, stock, projectTrim, units) })}
                          >
                            <option value="project">{projectEdges}</option>
                            <option value="use">Use factory edges</option>
                            <option value="trim">Trim</option>
                          </select>
                          {edgeChoice(stock) === "trim" && (
                            <LengthInput
                              aria-label={`Trim of stock ${label}`}
                              className="narrow"
                              value={stock.trim}
                              units={units}
                              disabled={!features.trim}
                              onChange={(trim) => trim !== undefined && change({ trim })}
                            />
                          )}
                        </span>
                      </td>
                      <td data-label="Use">
                        <input
                          type="checkbox"
                          aria-label={`Use stock ${label}`}
                          checked={stock.enabled !== false}
                          onChange={(event) => change({ enabled: event.target.checked ? undefined : false })}
                        />
                      </td>
                      <td className="actions">
                        <button type="button" aria-label={`Delete stock ${label}`} onClick={() => edit((p) => removeStock(p, stock.id))}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {browsing && (
        <CatalogDialog
          project={project}
          onAdd={(next) => {
            edit(next);
            setBrowsing(false);
          }}
          onClose={() => setBrowsing(false)}
        />
      )}
      {importing !== null && (
        <CsvImportDialog
          kind="stock"
          text={importing}
          project={project}
          onImport={(next) => {
            edit(next);
            setImporting(null);
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </div>
  );
}
