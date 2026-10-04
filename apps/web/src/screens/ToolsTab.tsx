import { addPresetTool, addTool, convertTool, errorMessage, moveTool, removeTool, TOOL_PRESETS, TOOL_TYPE_NAMES, TOOL_TYPES, updateTool, type Tool, type ToolType, type Units } from "@opencutplan/core";
import { Fragment, useCallback, useEffect, useState } from "react";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import type { Storage, ToolProfile } from "../storage/db.ts";

type Limit = "maxRip" | "maxCrosscut" | "maxCut";
type PieceLimit = "maxPiece" | "maxCrosscutPiece";

const TYPE_LIMITS: Readonly<Record<ToolType, readonly { key: Limit; label: string }[]>> = {
  "table-saw": [
    { key: "maxRip", label: "Widest rip" },
    { key: "maxCrosscut", label: "Longest crosscut" },
  ],
  "track-saw": [{ key: "maxCut", label: "Longest cut" }],
  "circular-saw": [{ key: "maxCut", label: "Longest cut" }],
  "panel-saw": [{ key: "maxCut", label: "Longest cut" }],
  "miter-saw": [{ key: "maxCut", label: "Widest crosscut" }],
};

const PIECES: readonly { key: PieceLimit; label: string; placeholder: string }[] = [
  { key: "maxPiece", label: "Largest piece for a rip", placeholder: "No limit" },
  { key: "maxCrosscutPiece", label: "Largest piece for a crosscut", placeholder: "As for a rip" },
];

function toolHelp(type: ToolType, units: Units): string {
  switch (type) {
    case "table-saw":
      return "Widest rip: from the fence to the blade. Longest crosscut: the longest cut on the sled or the mitre gauge. Largest piece: the largest piece that you can control on the saw. A blank crosscut piece uses the piece for a rip.";
    case "track-saw":
      return `Longest cut: the rail length less about ${units === "in" ? '8"' : "200 mm"}, for the start and the end of the cut.`;
    case "circular-saw":
      return "Longest cut: the length of your straightedge.";
    case "panel-saw":
      return "Longest cut: the cut capacity of the saw. Most cut stages: the deepest cut stage that the saw can make.";
    case "miter-saw":
      return "A mitre saw makes crosscuts only. Widest crosscut: the widest piece that the saw can cut across. The piece can have any length.";
  }
}

function setLimit(tool: Tool, key: string, value: number | undefined): Tool {
  const next: Record<string, unknown> = { ...tool };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as Tool;
}

/** A largest piece needs both sizes: setting one fills the other with the same value, and clearing one clears both. */
function setPiece(tool: Tool, key: PieceLimit, length: number | undefined, width: number | undefined): Tool {
  return length === undefined || width === undefined ? setLimit(tool, key, undefined) : { ...tool, [key]: { length, width } };
}

interface ToolsTabProps {
  store: ProjectStore;
  storage: Storage;
}

export function ToolsTab({ store, storage }: ToolsTabProps) {
  const { project, edit } = store;
  const units = project.project.units;
  const display = project.settings.display;
  const [type, setType] = useState<ToolType>("table-saw");
  const [preset, setPreset] = useState(TOOL_PRESETS[0]!.id);
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [chosen, setChosen] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      storage.listProfiles().then(
        (list) => setProfiles(list),
        (e: unknown) => setStatus(`The saved profiles could not be read: ${errorMessage(e)}`),
      ),
    [storage],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const profile = profiles.find((p) => p.name === chosen) ?? profiles[0];

  const saveProfile = async () => {
    const name = profileName.trim();
    try {
      await storage.saveProfile({ name, units, tools: project.tools });
      setStatus(`Saved the profile “${name}”.`);
      setProfileName("");
      setChosen(name);
      await refresh();
    } catch (e) {
      setStatus(`The profile could not be saved: ${errorMessage(e)}`);
    }
  };

  const deleteProfile = async () => {
    if (!profile) return;
    try {
      await storage.deleteProfile(profile.name);
      setStatus(`Deleted the profile “${profile.name}”.`);
    } catch (e) {
      setStatus(`The profile could not be deleted: ${errorMessage(e)}`);
    }
    await refresh();
  };

  return (
    <div className="tools-tab">
      <section aria-labelledby="tools-title">
        <div className="toolbar">
          <h2 id="tools-title">Tools</h2>
          <label className="inline">
            Type
            <select value={type} onChange={(event) => setType(event.target.value as ToolType)}>
              {TOOL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TOOL_TYPE_NAMES[t]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={() => edit((p) => addTool(p, type))}>
            Add tool
          </button>
        </div>
        <div className="toolbar">
          <label className="inline">
            Typical saw
            <select value={preset} onChange={(event) => setPreset(event.target.value)}>
              {TOOL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.values[units].name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => edit((p) => addPresetTool(p, preset))}>
            Add typical saw
          </button>
        </div>
        <p className="muted">
          Each cut goes to the first enabled tool in this list that can make it. Leave a limit blank for no limit. A typical saw has typical values for
          its type: measure your saw and change them.
        </p>
        {project.tools.length === 0 && <p className="error">✖ No tools yet. Add a tool so the plan can be cut.</p>}
        <ol className="tool-list">
          {project.tools.map((tool, index) => {
            const change = (next: (t: Tool) => Tool) => edit((p) => updateTool(p, tool.id, next));
            return (
              <li key={tool.id} className={tool.enabled ? "" : "disabled"}>
                <fieldset>
                  <legend>
                    {index + 1}. {TOOL_TYPE_NAMES[tool.type]}
                  </legend>
                  <p className="muted tool-help">{toolHelp(tool.type, units)}</p>
                  <div className="tool-fields">
                    <label className="stack">
                      Name
                      <TextInput value={tool.name} required onChange={(name) => change((t) => ({ ...t, name }))} />
                    </label>
                    <label className="stack">
                      Kerf
                      <LengthInput value={tool.kerf} units={units} display={display} allowZero onChange={(kerf) => kerf !== undefined && change((t) => ({ ...t, kerf }))} />
                    </label>
                    {TYPE_LIMITS[tool.type].map(({ key, label }) => (
                      <label className="stack" key={key}>
                        {label}
                        <LengthInput
                          value={(tool as Partial<Record<Limit, number>>)[key]}
                          units={units}
                          display={display}
                          optional
                          placeholder="No limit"
                          onChange={(value) => change((t) => setLimit(t, key, value))}
                        />
                      </label>
                    ))}
                    {tool.type === "table-saw" &&
                      PIECES.map(({ key, label, placeholder }) => {
                        const piece = tool[key];
                        return (
                          <Fragment key={key}>
                            <label className="stack">
                              {label}, length
                              <LengthInput
                                value={piece?.length}
                                units={units}
                                display={display}
                                optional
                                placeholder={placeholder}
                                onChange={(length) => change((t) => setPiece(t, key, length, length === undefined ? undefined : (piece?.width ?? length)))}
                              />
                            </label>
                            <label className="stack">
                              {label}, width
                              <LengthInput
                                value={piece?.width}
                                units={units}
                                display={display}
                                optional
                                placeholder={placeholder}
                                onChange={(width) => change((t) => setPiece(t, key, width === undefined ? undefined : (piece?.length ?? width), width))}
                              />
                            </label>
                          </Fragment>
                        );
                      })}
                    {tool.type === "panel-saw" && (
                      <label className="stack">
                        Most cut stages
                        <NumberInput value={tool.maxStages} integer minimum={1} optional placeholder="No limit" onChange={(value) => change((t) => setLimit(t, "maxStages", value))} />
                      </label>
                    )}
                    <label className="inline">
                      <input type="checkbox" checked={tool.enabled} onChange={(event) => change((t) => ({ ...t, enabled: event.target.checked }))} />
                      Enabled
                    </label>
                  </div>
                  <div className="buttons">
                    <button type="button" disabled={index === 0} onClick={() => edit((p) => moveTool(p, tool.id, -1))} aria-label={`Move ${tool.name} up`}>
                      ↑ Up
                    </button>
                    <button type="button" disabled={index === project.tools.length - 1} onClick={() => edit((p) => moveTool(p, tool.id, 1))} aria-label={`Move ${tool.name} down`}>
                      ↓ Down
                    </button>
                    <button type="button" onClick={() => edit((p) => removeTool(p, tool.id))} aria-label={`Delete ${tool.name}`}>
                      Delete
                    </button>
                  </div>
                </fieldset>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="profiles-title">
        <h2 id="profiles-title">Tool profiles</h2>
        <p className="muted">A profile keeps a set of tools in this browser, so you can use it in other projects.</p>
        <div className="toolbar">
          <label className="inline">
            Profile name
            <input type="text" value={profileName} onChange={(event) => setProfileName(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={profileName.trim() === "" || project.tools.length === 0}
            onClick={() => void saveProfile()}
          >
            Save tools as profile
          </button>
        </div>
        {profiles.length > 0 && (
          <div className="toolbar">
            <label className="inline">
              Saved profiles
              <select value={profile?.name ?? ""} onChange={(event) => setChosen(event.target.value)}>
                {profiles.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.tools.length} {p.tools.length === 1 ? "tool" : "tools"})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!profile}
              onClick={() => {
                if (!profile) return;
                edit((p) => ({ ...p, tools: profile.tools.map((tool) => convertTool(tool, profile.units, units)) }));
                setStatus(`The project now uses the tools from “${profile.name}”.`);
              }}
            >
              Use profile
            </button>
            <button
              type="button"
              disabled={!profile}
              onClick={() => void deleteProfile()}
            >
              Delete profile
            </button>
          </div>
        )}
        {status && <p role="status">{status}</p>}
      </section>
    </div>
  );
}
