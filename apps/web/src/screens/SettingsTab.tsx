import {
  convertProjectUnits,
  DEFAULT_MIN_OFFCUT,
  DEFAULT_TRIM,
  FEATURE_KEYS,
  type Features,
  type InchPrecision,
  type MmPrecision,
  type Project,
  type Settings,
  type Units,
} from "@opencutplan/core";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import type { ViewPrefs } from "../state/prefs.ts";
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

const INCH_STEPS: readonly { value: InchPrecision; label: string }[] = [
  { value: 8, label: '1/8"' },
  { value: 16, label: '1/16"' },
  { value: 32, label: '1/32"' },
  { value: 64, label: '1/64"' },
  { value: "decimal", label: "Decimal inches" },
];
const MM_STEPS: readonly MmPrecision[] = [1, 0.5, 0.1];
const LISTED_FEATURES = FEATURE_KEYS.filter((key) => key !== "trim" && key !== "snapping");

interface SettingsTabProps {
  store: ProjectStore;
  prefs: ViewPrefs;
  onPrefs(prefs: ViewPrefs): void;
}

export function SettingsTab({ store, prefs, onPrefs }: SettingsTabProps) {
  const { project, edit } = store;
  const { settings } = project;
  const units = project.project.units;
  const display = settings.display;
  const set = (change: (settings: Settings) => Settings, key?: string) => edit((p: Project) => ({ ...p, settings: change(p.settings) }), key);
  const minOffcut = settings.minOffcut ?? DEFAULT_MIN_OFFCUT[units];
  const factoryEdges = !settings.features.trim || settings.trim === 0;
  const feature = (key: keyof Features) => (
    <label key={key} className="switch">
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
  );

  return (
    <div className="settings-tab">
      <h2 className="visually-hidden">Settings</h2>
      <fieldset>
        <legend>Units and precision</legend>
        <label className="stack">
          Units
          <select value={units} onChange={(event) => edit((p) => convertProjectUnits(p, event.target.value as Units))}>
            <option value="in">Inches</option>
            <option value="mm">Millimetres</option>
          </select>
        </label>
        {units === "in" ? (
          <label className="stack">
            Show lengths to
            <select
              value={String(display.inch)}
              onChange={(event) => {
                const value = event.target.value === "decimal" ? "decimal" : (Number(event.target.value) as InchPrecision);
                set((s) => ({ ...s, display: { ...s.display, inch: value } }));
              }}
            >
              {INCH_STEPS.map((step) => (
                <option key={step.value} value={String(step.value)}>
                  {step.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="stack">
            Show lengths to
            <select value={String(display.mm)} onChange={(event) => set((s) => ({ ...s, display: { ...s.display, mm: Number(event.target.value) as MmPrecision } }))}>
              {MM_STEPS.map((step) => (
                <option key={step} value={String(step)}>
                  {step} mm
                </option>
              ))}
            </select>
          </label>
        )}
      </fieldset>

      <fieldset>
        <legend>Factory edges</legend>
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
      </fieldset>

      <fieldset>
        <legend>Snapping</legend>
        {feature("snapping")}
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
      </fieldset>

      <fieldset>
        <legend>Plan</legend>
        <label className="stack">
          Cut order
          <select value={settings.orderMode} onChange={(event) => set((s) => ({ ...s, orderMode: event.target.value as Settings["orderMode"] }))}>
            <option value="sheet">Sheet by sheet</option>
            <option value="setup">Group cuts with the same saw setting</option>
          </select>
        </label>
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
      </fieldset>

      <fieldset>
        <legend>Optimizer</legend>
        <label className="stack">
          Search time (seconds)
          <NumberInput
            value={settings.optimizer.timeLimitMs / 1000}
            minimum={0.1}
            onChange={(seconds) => seconds !== undefined && set((s) => ({ ...s, optimizer: { ...s.optimizer, timeLimitMs: Math.max(1, Math.round(seconds * 1000)) } }))}
          />
        </label>
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
      </fieldset>

      <fieldset>
        <legend>Money</legend>
        <label className="stack">
          Currency (3-letter code)
          <TextInput
            value={settings.currency}
            maxLength={3}
            valid={(text) => /^[A-Za-z]{3}$/.test(text)}
            onChange={(currency) => set((s) => ({ ...s, currency: currency.toUpperCase() }))}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>View (this browser only)</legend>
        <label className="switch">
          <input type="checkbox" checked={prefs.showCuts} onChange={(event) => onPrefs({ ...prefs, showCuts: event.target.checked })} />
          <span>
            <b>Show cut lines</b>
          </span>
        </label>
        <label className="switch">
          <input type="checkbox" checked={prefs.showKerf} onChange={(event) => onPrefs({ ...prefs, showKerf: event.target.checked })} />
          <span>
            <b>Draw cut lines at kerf width</b>
          </span>
        </label>
      </fieldset>

      <fieldset>
        <legend>Features</legend>
        {LISTED_FEATURES.map(feature)}
      </fieldset>
    </div>
  );
}
