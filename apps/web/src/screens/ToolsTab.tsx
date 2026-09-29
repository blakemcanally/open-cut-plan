import { addTool, convertTool, moveTool, removeTool, TOOL_TYPE_NAMES, TOOL_TYPES, updateTool, type Tool, type ToolType } from "@opencutplan/core";
import { useCallback, useEffect, useState } from "react";
import { LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import type { Storage, ToolProfile } from "../storage/db.ts";

type Limit = "maxRip" | "maxCrosscut" | "maxCut";

const LIMIT_LABELS: Readonly<Record<Limit, string>> = {
  maxRip: "Widest rip",
  maxCrosscut: "Longest crosscut",
  maxCut: "Longest cut",
};

const TYPE_LIMITS: Readonly<Record<ToolType, readonly Limit[]>> = {
  "table-saw": ["maxRip", "maxCrosscut"],
  "track-saw": ["maxCut"],
  "circular-saw": ["maxCut"],
  "panel-saw": ["maxCut"],
};

function setLimit(tool: Tool, key: string, value: number | undefined): Tool {
  const next: Record<string, unknown> = { ...tool };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next as Tool;
}

/** A largest piece needs both sizes: setting one fills the other with the same value, and clearing one clears both. */
function setMaxPiece(tool: Tool, length: number | undefined, width: number | undefined): Tool {
  return length === undefined || width === undefined ? setLimit(tool, "maxPiece", undefined) : ({ ...tool, maxPiece: { length, width } } as Tool);
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
  const [profiles, setProfiles] = useState<ToolProfile[]>([]);
  const [profileName, setProfileName] = useState("");
  const [chosen, setChosen] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(
    () =>
      storage.listProfiles().then(
        (list) => setProfiles(list),
        (e: unknown) => setStatus(`The saved profiles could not be read: ${(e as Error).message}`),
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
      setStatus(`The profile could not be saved: ${(e as Error).message}`);
    }
  };

  const deleteProfile = async () => {
    if (!profile) return;
    try {
      await storage.deleteProfile(profile.name);
      setStatus(`Deleted the profile “${profile.name}”.`);
    } catch (e) {
      setStatus(`The profile could not be deleted: ${(e as Error).message}`);
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
        <p className="muted">Each cut goes to the first enabled tool in this list that can make it. Leave a limit blank for no limit.</p>
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
                  <div className="tool-fields">
                    <label className="stack">
                      Name
                      <TextInput value={tool.name} required onChange={(name) => change((t) => ({ ...t, name }))} />
                    </label>
                    <label className="stack">
                      Kerf
                      <LengthInput value={tool.kerf} units={units} display={display} allowZero onChange={(kerf) => kerf !== undefined && change((t) => ({ ...t, kerf }))} />
                    </label>
                    {TYPE_LIMITS[tool.type].map((key) => (
                      <label className="stack" key={key}>
                        {LIMIT_LABELS[key]}
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
                    {tool.type === "table-saw" && (
                      <>
                        <label className="stack">
                          Largest piece, length
                          <LengthInput
                            value={tool.maxPiece?.length}
                            units={units}
                            display={display}
                            optional
                            placeholder="No limit"
                            onChange={(length) => change((t) => setMaxPiece(t, length, length === undefined ? undefined : (tool.maxPiece?.width ?? length)))}
                          />
                        </label>
                        <label className="stack">
                          Largest piece, width
                          <LengthInput
                            value={tool.maxPiece?.width}
                            units={units}
                            display={display}
                            optional
                            placeholder="No limit"
                            onChange={(width) => change((t) => setMaxPiece(t, width === undefined ? undefined : (tool.maxPiece?.length ?? width), width))}
                          />
                        </label>
                      </>
                    )}
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
