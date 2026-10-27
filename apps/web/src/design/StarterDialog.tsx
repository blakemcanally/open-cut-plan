import {
  checkDesigns,
  designElevationSvg,
  designSheetEstimate,
  formatLength,
  IKEA_NOTICE,
  regenerateDesigns,
  starterFits,
  starterName,
  STARTERS,
  type Design,
  type DesignMount,
  type GridChoice,
  type OptionChoice,
  type PlanIssue,
  type Project,
  type Starter,
  type StarterGroup,
  type StarterId,
  type StarterValues,
} from "@opencutplan/core";
import { useDeferredValue, useMemo, useState } from "react";
import { Dialog } from "../components/Dialog.tsx";
import { addStarter, outsideText } from "./form.ts";
import { GridPicker } from "./GridPicker.tsx";

interface StarterDialogProps {
  project: Project;
  onUse(result: { project: Project; id: string }): void;
  onClose(): void;
}

type Candidate = { ok: true; added: Project; project: Project; design: Design } | { ok: false; issues: PlanIssue[] };

const MOUNT_TEXT: Readonly<Record<DesignMount, string>> = { floor: "Floor", legs: "Legs", feet: "Feet", "wall-rail": "Wall rail" };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function candidate(project: Project, starter: Starter, values: StarterValues): Candidate {
  const added = addStarter(project, starter, values);
  if (!added.ok) return added;
  const regenerated = regenerateDesigns(added.project);
  return { ok: true, added: added.project, project: regenerated, design: regenerated.designs!.find((design) => design.id === added.id)! };
}

const SECTIONS = ((): { group: StarterGroup; starters: Starter[] }[] => {
  const out: { group: StarterGroup; starters: Starter[] }[] = [];
  for (const starter of STARTERS) {
    const last = out.at(-1);
    if (last && last.group === starter.group) last.starters.push(starter);
    else out.push({ group: starter.group, starters: [starter] });
  }
  return out;
})();

const gridOf = (starter: Starter) => starter.choices.find((choice): choice is GridChoice => choice.kind === "grid");

function rangeText(grid: GridChoice): string {
  return `${grid.columns.min} × ${grid.rows.min} to ${grid.columns.max} × ${grid.rows.max}`;
}

function Sheets({ candidate: shown }: { candidate: Extract<Candidate, { ok: true }> }) {
  const deferred = useDeferredValue(shown);
  const estimate = useMemo(() => designSheetEstimate(deferred.project, deferred.design), [deferred]);
  const units = deferred.project.project.units;
  const materialText = (id: string) => {
    const material = deferred.project.materials.find((item) => item.id === id);
    return material ? `${material.name} (${formatLength(material.thickness, units, deferred.project.settings.display)})` : id;
  };
  return (
    <>
      {(estimate ?? []).map((entry) => (
        <span key={entry.material} className="starter-sheets">
          {entry.noStock ? `No sheet stock of ${materialText(entry.material)}` : `About ${plural(entry.sheets, "sheet")} of ${materialText(entry.material)}`}
        </span>
      ))}
    </>
  );
}

const NOMINAL_NOTE = "The stock thickness is nominal. Measure it on the Stock tab.";

export function StarterDialog({ project, onUse, onClose }: StarterDialogProps) {
  const [chosen, setChosen] = useState<StarterId>(STARTERS[0]!.id);
  const [set, setSet] = useState<Readonly<Partial<Record<StarterId, StarterValues>>>>({});
  const [hover, setHover] = useState<{ columns: number; rows: number } | null>(null);
  const starter = STARTERS.find((item) => item.id === chosen)!;
  const values = set[chosen] ?? starter.defaults;
  const columns = hover?.columns ?? values.columns;
  const rows = hover?.rows ?? values.rows;
  const { options } = values;

  const shown = useMemo(() => candidate(project, starter, { columns, rows, options }), [project, starter, columns, rows, options]);
  const defaults = useMemo(
    () =>
      new Map(
        STARTERS.map((item) => {
          const result = candidate(project, item, item.defaults);
          return [item.id, result.ok ? { outside: outsideText(result.project, result.design), svg: designElevationSvg(result.project, result.design.id) } : null] as const;
        }),
      ),
    [project],
  );

  const change = (next: StarterValues) => setSet({ ...set, [chosen]: next });
  const choose = (id: StarterId) => {
    setHover(null);
    setChosen(id);
  };
  const svg = shown.ok ? designElevationSvg(shown.project, shown.design.id) : null;
  const warnings = shown.ok ? checkDesigns(shown.project).filter((issue) => issue.severity === "warning" && issue.refs.some((ref) => ref.kind === "design" && ref.design === shown.design.id)) : [];
  const designIssues = [...warnings.filter((issue) => issue.code !== "nominal-thickness"), ...(warnings.some((issue) => issue.code === "nominal-thickness") ? [{ message: NOMINAL_NOTE }] : [])];
  const fits = shown.ok ? starterFits(shown.project, shown.design.id) : [];

  return (
    <Dialog title="Add a design" className="starter-dialog" onClose={onClose}>
      <div className="starter">
        <div className="starter-list">
          {SECTIONS.map(({ group, starters }) => (
            <section key={group ?? "custom"}>
              {group && <h4>{group}</h4>}
              <ul>
                {starters.map((item) => {
                  const grid = gridOf(item);
                  const preview = defaults.get(item.id);
                  return (
                    <li key={item.id}>
                      <button type="button" className="starter-row" aria-pressed={item.id === chosen} onClick={() => choose(item.id)}>
                        <span className="starter-thumb" aria-hidden="true" dangerouslySetInnerHTML={{ __html: preview?.svg ?? "" }} />
                        <b>{item.name}</b>
                        <span className="muted">{grid ? rangeText(grid) : (preview?.outside ?? "")}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="muted starter-notice">{IKEA_NOTICE}</p>
        </div>
        <div className="starter-preview">
          <h3>{starterName(starter, { columns, rows, options })}</h3>
          <p className="muted">{starter.note}</p>
          <div className="starter-view">
            {starter.choices.length > 0 && (
              <div className="starter-choices">
                {starter.choices.map((choice) =>
                  choice.kind === "grid" ? (
                    <GridPicker key={`${starter.id}-grid`} columns={choice.columns} rows={choice.rows} value={{ columns: values.columns, rows: values.rows }} onHover={setHover} onChange={(size) => change({ ...values, ...size })} />
                  ) : (
                    <OptionButtons key={choice.key} choice={choice} value={options[choice.key] ?? starter.defaults.options[choice.key]!} onChange={(value) => change({ ...values, options: { ...options, [choice.key]: value } })} />
                  ),
                )}
              </div>
            )}
            {svg && shown.ok && (
              <div className="starter-drawing" role="img" aria-label={`Front view of ${shown.design.name}: ${outsideText(shown.project, shown.design)}`} dangerouslySetInnerHTML={{ __html: svg }} />
            )}
          </div>
          {shown.ok ? (
            <dl className="starter-facts">
              <dt>Outside</dt>
              <dd>{outsideText(shown.project, shown.design)}</dd>
              <dt>Mount</dt>
              <dd>{MOUNT_TEXT[(shown.design.mount ?? "floor") as DesignMount] ?? shown.design.mount}</dd>
              {fits.length > 0 && (
                <>
                  <dt>Fits</dt>
                  <dd>{fits.join(", ")}</dd>
                </>
              )}
              <dt>Sheets</dt>
              <dd>
                <Sheets candidate={shown} />
              </dd>
            </dl>
          ) : (
            <p role="alert" className="error">
              ✖ {shown.issues.map((issue) => issue.message).join(" ")}
            </p>
          )}
          {designIssues.length > 0 && (
            <ul className="starter-warnings warning">
              {designIssues.map((issue, index) => (
                <li key={index}>
                  <span aria-hidden="true">⚠ </span>
                  <span className="visually-hidden">Warning: </span>
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          <div className="dialog-foot">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="primary" disabled={!shown.ok} onClick={() => shown.ok && onUse({ project: shown.added, id: shown.design.id })}>
              Use this design
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function OptionButtons({ choice, value, onChange }: { choice: OptionChoice; value: string; onChange(value: string): void }) {
  return (
    <div role="group" aria-label={choice.label} className="starter-options">
      <span className="muted">{choice.label}</span>
      {choice.values.map((item) => (
        <button key={item.value} type="button" aria-pressed={item.value === value} onClick={() => onChange(item.value)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}
