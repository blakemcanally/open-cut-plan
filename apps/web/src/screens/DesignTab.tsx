import {
  axisCells,
  CATALOG_FAMILIES,
  catalogFor,
  projectMaterialFor,
  DESIGN_MOUNTS,
  DESIGN_SYSTEM_NAMES,
  DESIGN_SYSTEMS,
  designColorKey,
  designElevationSvg,
  designUnitLabel,
  designGeometry,
  designParts,
  detachDesign,
  fitCombined,
  formatLength,
  isDesignMount,
  isDesignSystem,
  isNewerMinor,
  materialsById,
  MAX_DESIGN_CELLS,
  MAX_DESIGN_QUANTITY,
  NO_GROUP_COLOR,
  parseLength,
  parsePlainNumber,
  partColors,
  removeDesign,
  setDesignColor,
  type CombinedCell,
  type Design,
  type DesignAxis,
  type DesignMount,
  type DesignSystem,
  type PlanIssue,
  type Project,
  type ProjectAnalysis,
} from "@opencutplan/core";
import { useState, type InputHTMLAttributes } from "react";
import { ColorChoice, LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { CellGrid } from "../design/CellGrid.tsx";
import { SheetEstimate } from "../design/SheetEstimate.tsx";
import { addDesign, axisMode, CATALOG_VALUE, openingsText, parseOpenings, pickMaterial, tryDesign, withCells, withMode, withSystem, type AxisMode } from "../design/form.ts";
import type { ProjectStore } from "../state/useProject.ts";

const MOUNT_LABELS: Readonly<Record<DesignMount, string>> = { floor: "Floor", legs: "EKET legs", feet: "EKET feet", "wall-rail": "EKET wall rail" };

interface DesignTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  /** The design to show first, from a link on the Parts tab. */
  focus?: string | null;
  onOptimize?: (() => void) | undefined;
  optimizing?: boolean;
}

export function designIssues(issues: readonly PlanIssue[], id: string): PlanIssue[] {
  return issues.filter((issue) => issue.refs.some((ref) => ref.kind === "design" && ref.design === id));
}

function CatalogOptions({ project }: { project: Project }) {
  const entries = catalogFor(project.project.units).filter((entry) => !projectMaterialFor(project, entry.id));
  return CATALOG_FAMILIES.map((family) => {
    const inFamily = entries.filter((entry) => entry.family === family);
    if (inFamily.length === 0) return null;
    return (
      <optgroup key={family} label={`Catalogue: ${family}`}>
        {inFamily.map((entry) => (
          <option key={entry.id} value={`${CATALOG_VALUE}${entry.id}`}>
            {entry.name}
          </option>
        ))}
      </optgroup>
    );
  });
}

function outsideText(project: Project, design: Design): string {
  const geometry = designGeometry(design, materialsById(project));
  if (!geometry) return "no size";
  const show = (value: number) => formatLength(value, project.project.units, project.settings.display);
  return `${show(geometry.outsideWidth)} × ${show(geometry.outsideHeight)} × ${show(geometry.depth)}`;
}

export function DesignTab({ store, analysis, focus = null, onOptimize, optimizing = false }: DesignTabProps) {
  const { project, edit } = store;
  const designs = project.designs ?? [];
  const [chosen, setChosen] = useState<string | null>(focus);
  const [addError, setAddError] = useState<string | null>(null);
  const selected = designs.find((design) => design.id === chosen) ?? designs[0];
  const newer = isNewerMinor(project.version);

  const add = () => {
    const result = addDesign(project);
    if (!result.ok) {
      setAddError(result.issues.map((issue) => issue.message).join(" "));
      return;
    }
    setAddError(null);
    edit(result.project);
    setChosen(result.id);
  };

  return (
    <div className="design-tab">
      <div className="toolbar">
        <h2 id="design-title">Designs</h2>
        <button
          type="button"
          className="primary"
          disabled={newer}
          title={newer ? "This file is from a newer OpenCutPlan. Update the app to add designs." : undefined}
          onClick={add}
        >
          Add design
        </button>
      </div>
      {addError && (
        <p role="alert" className="error">
          ✖ {addError}
        </p>
      )}
      {!selected ? (
        <p className="muted">No designs yet. A design makes the parts of a box unit with a grid of cells: KALLAX-style, EKET-style, or your own sizes.</p>
      ) : (
        <div className="design-body">
          <ul className="design-list" aria-label="Designs">
            {designs.map((design) => (
              <li key={design.id}>
                <button type="button" aria-pressed={design.id === selected.id} onClick={() => setChosen(design.id)}>
                  <b>{design.name}</b> <span className="muted">{outsideText(project, design)}</span>
                </button>
              </li>
            ))}
          </ul>
          <DesignEditor
            key={selected.id}
            store={store}
            design={selected}
            issues={designIssues(analysis.issues, selected.id)}
            onOptimize={onOptimize}
            optimizing={optimizing}
          />
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  store: ProjectStore;
  design: Design;
  issues: PlanIssue[];
  onOptimize: (() => void) | undefined;
  optimizing: boolean;
}

type Which = "width" | "height";

const AXIS_TEXT: Readonly<Record<Which, { cells: string; outside: string; openings: string }>> = {
  width: { cells: "Columns", outside: "Outside width", openings: "Column openings, left to right" },
  height: { cells: "Rows", outside: "Outside height", openings: "Row openings, top to bottom" },
};

function DesignEditor({ store, design, issues, onOptimize, optimizing }: EditorProps) {
  const { project, edit } = store;
  const units = project.project.units;
  const display = project.settings.display;
  const [refused, setRefused] = useState<{ field: string; message: string } | null>(null);
  const [typing, setTyping] = useState<Design | null>(null);
  const [selected, setSelected] = useState<CombinedCell | null>(null);
  const geometry = designGeometry(design, materialsById(project));
  const locked = isNewerMinor(project.version)
    ? `This file has the format version ${project.version}, from a newer OpenCutPlan. Update the app to change its designs.`
    : !isDesignSystem(design.system)
      ? `This design uses the system "${design.system}", which this app does not know. Its parts stay as they are.`
      : null;
  const system: DesignSystem = isDesignSystem(design.system) ? design.system : "custom";

  const apply = (field: string, change: (design: Design) => Design, base: Project = project): boolean => {
    const result = tryDesign(base, change(design));
    if (!result.ok) {
      setRefused({ field, message: result.issues.map((issue) => issue.message).join(" ") });
      return false;
    }
    setRefused(null);
    setTyping(null);
    edit(result.project);
    return true;
  };

  /** Draws the design with the text in the field before the field commits it. */
  const live = (change: (design: Design, text: string) => Design | null): Pick<InputHTMLAttributes<HTMLInputElement>, "onInput" | "onBlur" | "onKeyDown"> => ({
    onInput: (event) => {
      const next = change(design, event.currentTarget.value);
      if (next && tryDesign(project, next).ok) setTyping(fitCombined(next));
    },
    onBlur: () => setTyping(null),
    onKeyDown: (event) => {
      if (event.key === "Enter" || event.key === "Escape") setTyping(null);
    },
  });
  const invalid = (field: string) => (refused?.field === field ? true : undefined);

  const colors = partColors(project);
  const unitColors = Array.from({ length: design.quantity ?? 1 }, (_, index) => {
    const key = colors.get(designColorKey(design.id, index + 1));
    const chosen = design.colors?.[index]?.toLowerCase() || null;
    return {
      unit: index + 1,
      label: designUnitLabel(design, index + 1),
      color: key?.color ?? chosen ?? NO_GROUP_COLOR,
      chosen: chosen !== null,
    };
  });

  const shown = typing ? { ...project, designs: (project.designs ?? []).map((item) => (item.id === design.id ? typing : item)) } : project;
  const svg = designElevationSvg(shown, design.id, { highlight: selected });
  const parts = designParts(shown, typing ?? design);
  const show = (value: number) => formatLength(value, units, display);

  const axisFields = (which: Which) => {
    const axis = design[which];
    const text = AXIS_TEXT[which];
    const openings = geometry ? (which === "width" ? geometry.columns : geometry.rows) : [];
    const outside = geometry ? (which === "width" ? geometry.outsideWidth : geometry.outsideHeight) : 0;
    const put = (next: DesignAxis) => (d: Design) => ({ ...d, [which]: next });
    const cells = (d: Design, value: number) => ({ ...d, [which]: withCells(system, d[which], value, units) });
    return (
      <fieldset key={which} disabled={locked !== null}>
        <legend>{which === "width" ? "Width" : "Height"}</legend>
        <div className="pair">
          <label className="stack">
            {text.cells}
            <NumberInput
              value={axisCells(axis)}
              integer
              minimum={1}
              maximum={MAX_DESIGN_CELLS}
              onChange={(value) => value !== undefined && apply(`${which}-cells`, (d) => cells(d, value))}
              {...live((d, t) => {
                const value = parsePlainNumber(t);
                return value !== null && Number.isSafeInteger(value) && value >= 1 && value <= MAX_DESIGN_CELLS ? cells(d, value) : null;
              })}
            />
          </label>
          <label className="stack">
            Size by
            <select
              value={axisMode(axis)}
              disabled={!geometry}
              onChange={(event) => apply(`${which}-mode`, put(withMode(axis, event.target.value as AxisMode, openings, outside)))}
            >
              <option value="outside">The outside size</option>
              <option value="openings">Each opening</option>
            </select>
          </label>
        </div>
        {"openings" in axis ? (
          <label className="stack">
            {text.openings}
            <TextInput
              value={openingsText(axis.openings, units, display)}
              valid={(value) => parseOpenings(value, units) !== null}
              onChange={(value) => apply(`${which}-openings`, put({ ...axis, openings: parseOpenings(value, units)! }))}
              {...live((d, t) => {
                const parsed = parseOpenings(t, units);
                return parsed ? { ...d, [which]: { ...axis, openings: parsed } } : null;
              })}
            />
          </label>
        ) : (
          <label className="stack">
            {text.outside}
            <LengthInput
              value={axis.outside}
              units={units}
              display={display}
              onChange={(value) => value !== undefined && apply(`${which}-outside`, put({ ...axis, outside: value }))}
              {...live((d, t) => {
                const value = parseLength(t, units);
                return value !== null && value > 0 ? { ...d, [which]: { ...axis, outside: value } } : null;
              })}
            />
          </label>
        )}
      </fieldset>
    );
  };

  return (
    <div className="design-editor">
      <form className="design-form" aria-label={`Design ${design.name}`} onSubmit={(event) => event.preventDefault()}>
        {locked && (
          <p role="status" className="warning">
            ⚠ {locked}
          </p>
        )}
        <fieldset disabled={locked !== null}>
          <legend>Design</legend>
          <label className="stack">
            Name
            <TextInput value={design.name} required onChange={(name) => apply("name", (d) => ({ ...d, name }))} />
          </label>
          <div className="pair">
            <label className="stack">
              System
              <select aria-invalid={invalid("system")} value={system} onChange={(event) => apply("system", (d) => withSystem(d, event.target.value as DesignSystem, units))}>
                {DESIGN_SYSTEMS.map((value) => (
                  <option key={value} value={value}>
                    {DESIGN_SYSTEM_NAMES[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="stack">
              How many to build
              <NumberInput
                value={design.quantity ?? 1}
                integer
                minimum={1}
                maximum={MAX_DESIGN_QUANTITY}
                onChange={(value) => value !== undefined && apply("quantity", (d) => ({ ...d, quantity: value }))}
              />
            </label>
          </div>
        </fieldset>
        {axisFields("width")}
        {axisFields("height")}
        <CellGrid
          design={design}
          columns={geometry?.columns ?? null}
          rows={geometry?.rows ?? null}
          disabled={locked !== null}
          onEdit={(change) => apply("cells", change)}
          onSelect={setSelected}
        />
        <fieldset disabled={locked !== null}>
          <legend>Box</legend>
          <label className="stack">
            Depth, with the back
            <LengthInput
              value={design.depth}
              units={units}
              display={display}
              onChange={(depth) => depth !== undefined && apply("depth", (d) => ({ ...d, depth }))}
              {...live((d, t) => {
                const depth = parseLength(t, units);
                return depth !== null && depth > 0 ? { ...d, depth } : null;
              })}
            />
          </label>
          <div className="pair">
            <label className="stack">
              Material
              <select
                aria-invalid={invalid("material")}
                value={design.material}
                onChange={(event) => {
                  const picked = pickMaterial(project, event.target.value);
                  apply("material", (d) => ({ ...d, material: picked.material }), picked.project);
                }}
              >
                {project.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({formatLength(material.thickness, units, display)})
                  </option>
                ))}
                {!project.materials.some((material) => material.id === design.material) && <option value={design.material}>{design.material} (missing)</option>}
                <CatalogOptions project={project} />
              </select>
            </label>
            <label className="stack">
              Back
              <select
                aria-invalid={invalid("back")}
                value={design.back?.material ?? ""}
                onChange={(event) => {
                  const picked = pickMaterial(project, event.target.value);
                  apply(
                    "back",
                    (d) => {
                      const { back: _back, ...rest } = d;
                      return picked.material === "" ? rest : { ...rest, back: { material: picked.material } };
                    },
                    picked.project,
                  );
                }}
              >
                <option value="">No back</option>
                {project.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({formatLength(material.thickness, units, display)})
                  </option>
                ))}
                {design.back && !project.materials.some((material) => material.id === design.back!.material) && (
                  <option value={design.back.material}>{design.back.material} (missing)</option>
                )}
                <CatalogOptions project={project} />
              </select>
            </label>
          </div>
          <label className="stack">
            Mount
            <select value={design.mount ?? "floor"} onChange={(event) => apply("mount", (d) => ({ ...d, mount: event.target.value }))}>
              {DESIGN_MOUNTS.map((mount) => (
                <option key={mount} value={mount}>
                  {MOUNT_LABELS[mount]}
                </option>
              ))}
              {design.mount !== undefined && !isDesignMount(design.mount) && <option value={design.mount}>{design.mount} (unknown)</option>}
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>Colours in the layout</legend>
          <ul className="color-list">
            {unitColors.map((entry) => (
              <li key={entry.unit}>
                <ColorChoice
                  label={entry.label}
                  color={entry.color}
                  chosen={entry.chosen}
                  onChange={(color) => edit((p) => setDesignColor(p, design.id, entry.unit, color), `color:${design.id}#${entry.unit}`)}
                />
              </li>
            ))}
          </ul>
        </fieldset>
        {refused && (
          <p role="alert" className="error">
            ✖ {refused.message}
          </p>
        )}
        <div className="buttons">
          <button type="button" title="Keep the parts as normal parts, and remove the design." onClick={() => edit((p) => detachDesign(p, design.id))}>
            Detach
          </button>
          <button type="button" onClick={() => edit((p) => removeDesign(p, design.id))}>
            Delete design
          </button>
        </div>
      </form>
      <div className="design-side">
        <section aria-labelledby="design-preview-title">
          <h3 id="design-preview-title">Front view</h3>
          {svg ? (
            <div className="design-preview" role="img" aria-label={`Front view of ${design.name}: ${outsideText(shown, typing ?? design)}`} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="muted">The design has an error, so there is no drawing.</p>
          )}
        </section>
        {parts && (
          <section aria-labelledby="design-parts-title">
            <h3 id="design-parts-title">Parts</h3>
            <div className="table-wrap">
              <table className="grid">
                <thead>
                  <tr>
                    <th scope="col">Part</th>
                    <th scope="col">Size</th>
                    <th scope="col">Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part) => (
                    <tr key={part.id}>
                      <td>{part.name}</td>
                      <td>
                        {show(part.length)} × {show(part.width)}
                      </td>
                      <td>{part.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <SheetEstimate project={project} design={typing ?? design} disabled={locked !== null} onEdit={(next) => edit(next)} onOptimize={onOptimize} optimizing={optimizing} />
        <section aria-labelledby="design-checks-title">
          <h3 id="design-checks-title">Checks</h3>
          {issues.length === 0 ? (
            <p className="ok">✔ The design passes every check.</p>
          ) : (
            <ul className="issues">
              {[...issues]
                .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
                .map((issue, index) => (
                  <li key={index} className={issue.severity}>
                    <span aria-hidden="true">{issue.severity === "error" ? "✖ " : "⚠ "}</span>
                    <span className="visually-hidden">{issue.severity === "error" ? "Error: " : "Warning: "}</span>
                    {issue.message}
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
