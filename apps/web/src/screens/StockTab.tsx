import {
  addMaterial,
  errorMessage,
  addStock,
  DEFAULT_TRIM,
  formatLength,
  materialInUse,
  removeMaterial,
  removeStock,
  updateMaterial,
  updateStock,
  type Stock,
  type StockKind,
  type Units,
} from "@opencutplan/core";
import { useState } from "react";
import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
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

export function StockTab({ store }: { store: ProjectStore }) {
  const { project, edit } = store;
  const [importing, setImporting] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
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
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Thickness</th>
                <th scope="col">Grained</th>
                <th scope="col">Colour</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.materials.map((material) => {
                const used = materialInUse(project, material.id);
                return (
                  <tr key={material.id}>
                    <td>
                      <TextInput aria-label={`Name of material ${material.name}`} value={material.name} required onChange={(name) => edit((p) => updateMaterial(p, material.id, { name }))} />
                    </td>
                    <td>
                      <LengthInput
                        aria-label={`Thickness of ${material.name}`}
                        value={material.thickness}
                        units={units}
                        display={display}
                        onChange={(thickness) => thickness !== undefined && edit((p) => updateMaterial(p, material.id, { thickness }))}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`${material.name} has grain`}
                        checked={material.grained}
                        onChange={(event) => edit((p) => updateMaterial(p, material.id, { grained: event.target.checked }))}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        aria-label={`Colour of ${material.name}`}
                        value={material.color ?? "#d9c9a3"}
                        onChange={(event) => edit((p) => updateMaterial(p, material.id, { color: event.target.value }), `material-color:${material.id}`)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Delete material ${material.name}`}
                        disabled={used}
                        title={used ? "Parts, stock, or designs use this material." : undefined}
                        onClick={() => edit((p) => removeMaterial(p, material.id))}
                      >
                        Delete
                      </button>
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
          <p className="muted">No stock yet. Add the sheets you can buy and the offcuts you own.</p>
        ) : (
          <div className="table-wrap">
            <table className="grid">
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
                  const label = stock.name ?? stock.id;
                  const change = (patch: Parameters<typeof updateStock>[2]) => edit((p) => updateStock(p, stock.id, patch));
                  return (
                    <tr key={stock.id}>
                      <td>
                        <TextInput aria-label={`Name of stock ${label}`} placeholder={stock.id} value={stock.name ?? ""} onChange={(name) => change({ name: name || undefined })} />
                      </td>
                      <td>
                        <select aria-label={`Material of stock ${label}`} value={stock.material} onChange={(event) => change({ material: event.target.value })}>
                          {project.materials.map((material) => (
                            <option key={material.id} value={material.id}>
                              {material.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <LengthInput aria-label={`Length of stock ${label}`} value={stock.length} units={units} display={display} onChange={(length) => length !== undefined && change({ length })} />
                      </td>
                      <td>
                        <LengthInput aria-label={`Width of stock ${label}`} value={stock.width} units={units} display={display} onChange={(width) => width !== undefined && change({ width })} />
                      </td>
                      <td>
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
                      <td>
                        <NumberInput aria-label={`Cost of stock ${label}`} className="narrow" value={stock.cost} optional onChange={(cost) => change({ cost })} />
                      </td>
                      <td>
                        <select aria-label={`Kind of stock ${label}`} value={stock.kind} onChange={(event) => change({ kind: event.target.value as StockKind })}>
                          <option value="sheet">Sheet to buy</option>
                          <option value="offcut">Offcut I own</option>
                        </select>
                      </td>
                      <td>
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
                              display={display}
                              disabled={!features.trim}
                              onChange={(trim) => trim !== undefined && change({ trim })}
                            />
                          )}
                        </span>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Use stock ${label}`}
                          checked={stock.enabled !== false}
                          onChange={(event) => change({ enabled: event.target.checked ? undefined : false })}
                        />
                      </td>
                      <td>
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
