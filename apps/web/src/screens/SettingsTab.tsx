import {
  convertProjectUnits,
  DEFAULT_FACTORY_EDGE_LENGTH,
  DEFAULT_MIN_OFFCUT,
  DEFAULT_TRIM,
  FEATURE_KEYS,
  INCH_PRECISIONS,
  isOptimizerGoal,
  MAX_EXTRA_COST_PERCENT,
  MM_PRECISIONS,
  type OptimizerGoal,
  type Features,
  type InchPrecision,
  type Project,
  type Settings,
  type Units,
} from "@opencutplan/core";
import { Fragment, useState, type ReactNode } from "react";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import type { ViewPrefs } from "../state/prefs.ts";
import { chooseOrder } from "../shop/progress.ts";
import type { ProjectStore } from "../state/useProject.ts";

export const FEATURE_TEXT: Readonly<Record<keyof Features, { label: string; detail: string }>> = {
  grain: { label: "Grain", detail: "Keep each part's grain along the sheet grain. Off: every part may turn." },
  kerf: { label: "Kerf", detail: "Leave one saw kerf between parts. Off: the kerf is 0." },
  trim: { label: "Edge trim", detail: "Cut off the factory edges of each sheet. Off: no trim." },
  cutOrder: { label: "Cut order", detail: "Show cut lines and the cut sequence, and check that every part can be cut free." },
  toolLimits: { label: "Tool limits", detail: "Keep each cut inside its tool's limits." },
  offcuts: { label: "Offcuts", detail: "List the usable offcuts that the plan leaves." },
  cost: { label: "Cost", detail: "Use stock prices. Off: the optimizer uses sheet area." },
  labels: { label: "Labels", detail: "Make a label for each part." },
  snapping: { label: "Snapping", detail: "Snap dragged parts to edges, neighbours, and the grid. Hold Alt (⌥) to drag without it." },
};

export const GOAL_LABELS: Readonly<Record<OptimizerGoal, string>> = { cost: "Lowest cost", offcuts: "Best offcuts", cuts: "Fewest cuts" };

function inchLabel(precision: InchPrecision): string {
  return precision === "decimal" ? "Decimal inches" : `1/${precision}"`;
}
const LISTED_FEATURES = FEATURE_KEYS.filter((key) => key !== "trim" && key !== "snapping");

export type SettingsSectionId = "units" | "edges" | "snapping" | "plan" | "optimizer" | "money" | "view" | "features";

interface Setting {
  names: readonly string[];
  node: ReactNode;
}

interface Section {
  id: SettingsSectionId;
  title: string;
  settings: readonly Setting[];
}

function matching(sections: readonly Section[], query: string): Section[] {
  const has = (text: string) => text.toLowerCase().includes(query);
  return sections.flatMap((section) => {
    if (has(section.title)) return [section];
    const settings = section.settings.filter((setting) => setting.names.some(has));
    return settings.length > 0 ? [{ ...section, settings }] : [];
  });
}

interface SettingsTabProps {
  store: ProjectStore;
  prefs: ViewPrefs;
  onPrefs(prefs: ViewPrefs): void;
  section: SettingsSectionId;
  onSection(section: SettingsSectionId): void;
}

export function SettingsTab({ store, prefs, onPrefs, section: current, onSection }: SettingsTabProps) {
  const [search, setSearch] = useState("");
  const { project, edit } = store;
  const { settings } = project;
  const units = project.project.units;
  const display = settings.display;
  const set = (change: (settings: Settings) => Settings, key?: string) => edit((p: Project) => ({ ...p, settings: change(p.settings) }), key);
  const minOffcut = settings.minOffcut ?? DEFAULT_MIN_OFFCUT[units];
  const goal = settings.optimizer.goal;
  const factoryEdges = !settings.features.trim || settings.trim === 0;
  const feature = (key: keyof Features): Setting => ({
    names: [FEATURE_TEXT[key].label],
    node: (
      <label className="switch">
        <input
          type="checkbox"
          checked={settings.features[key]}
          onChange={(event) => set((s) => ({ ...s, features: { ...s.features, [key]: event.target.checked } }))}
        />
        <span>
          <b>{FEATURE_TEXT[key].label}</b>
          <small>{FEATURE_TEXT[key].detail}</small>
        </span>
      </label>
    ),
  });

  const sections: readonly Section[] = [
    {
      id: "units",
      title: "Units and precision",
      settings: [
        {
          names: ["Units"],
          node: (
            <label className="stack">
              Units
              <select value={units} onChange={(event) => edit((p) => convertProjectUnits(p, event.target.value as Units))}>
                <option value="in">Inches</option>
                <option value="mm">Millimetres</option>
              </select>
            </label>
          ),
        },
        {
          names: ["Show lengths to"],
          node:
            units === "in" ? (
              <label className="stack">
                Show lengths to
                <select
                  value={String(display.inch)}
                  onChange={(event) => {
                    const inch = INCH_PRECISIONS.find((step) => String(step) === event.target.value);
                    if (inch !== undefined) set((s) => ({ ...s, display: { ...s.display, inch } }));
                  }}
                >
                  {INCH_PRECISIONS.map((step) => (
                    <option key={step} value={String(step)}>
                      {inchLabel(step)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="stack">
                Show lengths to
                <select
                  value={String(display.mm)}
                  onChange={(event) => {
                    const mm = MM_PRECISIONS.find((step) => String(step) === event.target.value);
                    if (mm !== undefined) set((s) => ({ ...s, display: { ...s.display, mm } }));
                  }}
                >
                  {MM_PRECISIONS.map((step) => (
                    <option key={step} value={String(step)}>
                      {step} mm
                    </option>
                  ))}
                </select>
              </label>
            ),
        },
      ],
    },
    {
      id: "edges",
      title: "Factory edges",
      settings: [
        {
          names: ["Use the factory edges", "Trim each edge", "Trim width"],
          node: (
            <>
              <label className="switch">
                <input type="radio" name="factory-edges" checked={factoryEdges} onChange={() => set((s) => ({ ...s, trim: 0 }))} />
                <span>
                  <b>Use the factory edges</b>
                  <small>Parts go up to the sheet edges. The plan has no trim cuts.</small>
                </span>
              </label>
              <label className="switch">
                <input
                  type="radio"
                  name="factory-edges"
                  checked={!factoryEdges}
                  onChange={() => set((s) => ({ ...s, features: { ...s.features, trim: true }, trim: s.trim > 0 ? s.trim : DEFAULT_TRIM[units] }))}
                />
                <span>
                  <b>Trim each edge</b>
                  <small>The first cuts take a strip off each factory edge.</small>
                </span>
              </label>
              {!factoryEdges && (
                <label className="stack">
                  Trim width
                  <LengthInput value={settings.trim} units={units} display={display} onChange={(trim) => trim !== undefined && set((s) => ({ ...s, trim }))} />
                </label>
              )}
              <p className="muted">A sheet on the Stock tab can make its own choice.</p>
            </>
          ),
        },
        {
          names: ["Put long parts on a factory edge", "Shortest long part"],
          node: (
            <>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings.factoryEdge !== undefined}
                  disabled={!factoryEdges}
                  onChange={(event) =>
                    set(({ factoryEdge: _rule, ...s }) => (event.target.checked ? { ...s, factoryEdge: { minLength: DEFAULT_FACTORY_EDGE_LENGTH[units] } } : s))
                  }
                />
                <span>
                  <b>Put long parts on a factory edge</b>
                  <small>
                    A factory edge is straighter than a cut edge. The optimizer puts a long edge of each long part on the edge of the sheet when the cost stays the
                    same, the longest parts first. The Parts tab can make a choice for each part.
                  </small>
                </span>
              </label>
              {settings.factoryEdge && (
                <label className="stack">
                  Shortest long part
                  <LengthInput
                    value={settings.factoryEdge.minLength}
                    units={units}
                    display={display}
                    disabled={!factoryEdges}
                    onChange={(minLength) => minLength !== undefined && set((s) => ({ ...s, factoryEdge: { ...s.factoryEdge, minLength } }))}
                  />
                </label>
              )}
              {!factoryEdges && <p className="muted">Use the factory edges to put long parts on them.</p>}
            </>
          ),
        },
      ],
    },
    {
      id: "snapping",
      title: "Snapping",
      settings: [
        feature("snapping"),
        {
          names: ["Grid (this browser only; 0 turns it off)"],
          node: (
            <label className="stack">
              Grid (this browser only; 0 turns it off)
              <LengthInput
                value={prefs.grid[units]}
                units={units}
                display={display}
                allowZero
                onChange={(grid) => grid !== undefined && onPrefs({ ...prefs, grid: { ...prefs.grid, [units]: grid } })}
              />
            </label>
          ),
        },
      ],
    },
    {
      id: "plan",
      title: "Plan",
      settings: [
        {
          names: ["Cut order"],
          node: (
            <label className="stack">
              Cut order
              <select value={settings.orderMode} onChange={(event) => edit((p) => chooseOrder(p, event.target.value as Settings["orderMode"]))}>
                <option value="sheet">By sheet</option>
                <option value="setup">By saw setting</option>
              </select>
            </label>
          ),
        },
        {
          names: ["Smallest offcut, length", "Smallest offcut, width"],
          node: (
            <div className="pair">
              <label className="stack">
                Smallest offcut, length
                <LengthInput
                  value={minOffcut.length}
                  units={units}
                  display={display}
                  onChange={(length) => length !== undefined && set((s) => ({ ...s, minOffcut: { ...minOffcut, length } }))}
                />
              </label>
              <label className="stack">
                Smallest offcut, width
                <LengthInput
                  value={minOffcut.width}
                  units={units}
                  display={display}
                  onChange={(width) => width !== undefined && set((s) => ({ ...s, minOffcut: { ...minOffcut, width } }))}
                />
              </label>
            </div>
          ),
        },
      ],
    },
    {
      id: "optimizer",
      title: "Optimizer",
      settings: [
        {
          names: ["Goal"],
          node: (
            <label className="stack">
              Goal
              <select value={goal} onChange={(event) => set((s) => ({ ...s, optimizer: { ...s.optimizer, goal: event.target.value } }))}>
                {Object.entries(GOAL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
                {!isOptimizerGoal(goal) && <option value={goal}>{goal} (unknown)</option>}
              </select>
              {goal === "offcuts" && !settings.features.offcuts && <small>The Offcuts feature is off, so this goal gives the same plan as the lowest cost.</small>}
            </label>
          ),
        },
        {
          names: ["Extra cost allowed (%)"],
          node: (
            <label className="stack">
              Extra cost allowed (%)
              <NumberInput
                value={settings.optimizer.extraCostPercent}
                maximum={MAX_EXTRA_COST_PERCENT}
                disabled={goal === "cost" || !isOptimizerGoal(goal)}
                onChange={(extraCostPercent) => extraCostPercent !== undefined && set((s) => ({ ...s, optimizer: { ...s.optimizer, extraCostPercent } }))}
              />
            </label>
          ),
        },
        {
          names: ["Keep each unit and group together"],
          node: (
            <label className="switch">
              <input
                type="checkbox"
                checked={settings.optimizer.keepGroupsTogether}
                onChange={(event) => set((s) => ({ ...s, optimizer: { ...s.optimizer, keepGroupsTogether: event.target.checked } }))}
              />
              <span>
                <b>Keep each unit and group together</b>
                <small>Put the parts of each design unit and each part group on as few sheets as possible. The cost does not go up.</small>
              </span>
            </label>
          ),
        },
        {
          names: ["Search time (seconds)"],
          node: (
            <label className="stack">
              Search time (seconds)
              <NumberInput
                value={settings.optimizer.timeLimitMs / 1000}
                minimum={0.1}
                maximum={3600}
                onChange={(seconds) => seconds !== undefined && set((s) => ({ ...s, optimizer: { ...s.optimizer, timeLimitMs: Math.max(1, Math.round(seconds * 1000)) } }))}
              />
            </label>
          ),
        },
        {
          names: ["Seed (blank for the default)"],
          node: (
            <label className="stack">
              Seed (blank for the default)
              <NumberInput
                value={settings.optimizer.seed}
                integer
                optional
                onChange={(seed) =>
                  set((s) => {
                    const { seed: _old, ...optimizer } = s.optimizer;
                    return { ...s, optimizer: seed === undefined ? optimizer : { ...optimizer, seed } };
                  })
                }
              />
            </label>
          ),
        },
      ],
    },
    {
      id: "money",
      title: "Money",
      settings: [
        {
          names: ["Currency (3-letter code)"],
          node: (
            <label className="stack">
              Currency (3-letter code)
              <TextInput
                value={settings.currency}
                maxLength={3}
                valid={(text) => /^[A-Za-z]{3}$/.test(text)}
                onChange={(currency) => set((s) => ({ ...s, currency: currency.toUpperCase() }))}
              />
            </label>
          ),
        },
      ],
    },
    {
      id: "view",
      title: "View (this browser only)",
      settings: [
        {
          names: ["Show cut lines"],
          node: (
            <label className="switch">
              <input type="checkbox" checked={prefs.showCuts} onChange={(event) => onPrefs({ ...prefs, showCuts: event.target.checked })} />
              <span>
                <b>Show cut lines</b>
              </span>
            </label>
          ),
        },
        {
          names: ["Draw cut lines at kerf width"],
          node: (
            <label className="switch">
              <input type="checkbox" checked={prefs.showKerf} onChange={(event) => onPrefs({ ...prefs, showKerf: event.target.checked })} />
              <span>
                <b>Draw cut lines at kerf width</b>
              </span>
            </label>
          ),
        },
      ],
    },
    { id: "features", title: "Features", settings: LISTED_FEATURES.map(feature) },
  ];
  const query = search.trim().toLowerCase();
  const shown = query === "" ? sections.filter((section) => section.id === current) : matching(sections, query);

  return (
    <div className="settings-tab">
      <h2 className="visually-hidden">Settings</h2>
      <div className="settings-side">
        <input type="search" aria-label="Search settings" placeholder="Search settings" value={search} onChange={(event) => setSearch(event.target.value)} />
        <nav aria-label="Settings sections">
          <ul className="settings-nav">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={section.id === current}
                  onClick={() => {
                    onSection(section.id);
                    setSearch("");
                  }}
                >
                  {section.title}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="settings-sections">
        {shown.length === 0 && <p className="muted">No setting matches "{search.trim()}".</p>}
        {shown.map((section) => (
          <fieldset key={section.id}>
            <legend>{section.title}</legend>
            {section.settings.map((setting) => (
              <Fragment key={setting.names[0]}>{setting.node}</Fragment>
            ))}
          </fieldset>
        ))}
      </div>
    </div>
  );
}
