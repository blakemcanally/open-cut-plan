import {
  addPart,
  addSuggestedStock,
  errorMessage,
  factoryEdgeRequest,
  isFactoryEdgeChoice,
  formatArea,
  formatLength,
  MAX_PART_QUANTITY,
  partColors,
  removePart,
  renameGroup,
  setGroupColor,
  updatePart,
  type Grain,
  type Part,
  type Project,
} from "@opencutplan/core";
import { useRef, useState, type ClipboardEvent, type FocusEvent } from "react";
import { CsvImportDialog } from "../components/CsvImportDialog.tsx";
import { ColorChoice, LengthInput, NumberInput, TextInput } from "../components/fields.tsx";
import { StocklessNotes } from "../components/StockNote.tsx";
import { TabLink } from "../components/TabLink.tsx";
import type { ProjectStore } from "../state/useProject.ts";
import { chooseFile } from "../storage/files.ts";

const GRAINS: readonly { value: Grain; label: string }[] = [
  { value: "length", label: "Along length" },
  { value: "width", label: "Along width" },
  { value: "none", label: "None" },
];

function ruleText(project: Project, part: Part): string {
  const { factoryEdge: _choice, ...byRule } = part;
  return `By the rule: ${factoryEdgeRequest(project, byRule) === null ? "none" : "long edge"}`;
}

/** Text with a tab or a line break came from a spreadsheet, not from typing in one cell. */
export function isTableText(text: string): boolean {
  return /[\t\n]/.test(text.trim());
}

function GroupRename({ group, onRename }: { group: string; onRename(name: string): void }) {
  const [open, setOpen] = useState(false);
  const cancelled = useRef(false);
  if (!open) {
    return (
      <button
        type="button"
        aria-label={`Rename group ${group}`}
        onClick={() => {
          cancelled.current = false;
          setOpen(true);
        }}
      >
        Rename
      </button>
    );
  }
  return (
    <TextInput
      aria-label={`New name of group ${group}`}
      value={group}
      required
      // oxlint-disable-next-line jsx-a11y/no-autofocus -- the field opens only when the user asks to rename the group
      autoFocus
      onChange={(name) => {
        if (cancelled.current) return;
        onRename(name);
        setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") cancelled.current = true;
        if (event.key === "Escape" || (event.key === "Enter" && event.currentTarget.value.trim() !== "")) setOpen(false);
      }}
      onBlur={() => setOpen(false)}
    />
  );
}

interface PartsTabProps {
  store: ProjectStore;
  onShowDesign?(design: string): void;
}

export function PartsTab({ store, onShowDesign }: PartsTabProps) {
  const { project, edit } = store;
  const designs = new Map((project.designs ?? []).map((design) => [design.id, design]));
  const [importing, setImporting] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const units = project.project.units;
  const display = project.settings.display;

  const selectAdded = (event: FocusEvent<HTMLInputElement>) => {
    event.currentTarget.select();
    setFocusId(null);
  };

  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData.getData("text/plain");
    if (!isTableText(text)) return;
    event.preventDefault();
    setImporting(text);
  };

  const importFile = async () => {
    setReadError(null);
    try {
      const file = await chooseFile(".csv,.tsv,.txt,text/csv");
      if (file) setImporting(await file.text());
    } catch (e) {
      setReadError(`The file could not be read: ${errorMessage(e)}`);
    }
  };

  const totals = new Map<string, { copies: number; area: number }>();
  for (const part of project.parts) {
    const total = totals.get(part.material) ?? { copies: 0, area: 0 };
    total.copies += part.quantity;
    total.area += part.quantity * part.length * part.width;
    totals.set(part.material, total);
  }

  const groupColors = partColors(project).legend.filter((key) => key.group !== undefined);

  return (
    <section aria-labelledby="parts-title" onPaste={onPaste}>
      <div className="toolbar">
        <h2 id="parts-title">Parts</h2>
        <button
          type="button"
          className="primary"
          onClick={() => {
            const result = addPart(project);
            edit(result.project);
            setFocusId(result.id);
          }}
        >
          Add part
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
      <StocklessNotes project={project} onAdd={(material) => edit((p) => addSuggestedStock(p, material).project)} />
      {project.parts.length === 0 ? (
        <p className="muted">
          No parts yet. Add a part, paste rows from a spreadsheet (name, length, width, quantity…), or add a design on the <TabLink tab="design">Design tab</TabLink>.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="grid cards" aria-labelledby="parts-title">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Length</th>
                <th scope="col">Width</th>
                <th scope="col">Qty</th>
                <th scope="col">Material</th>
                <th scope="col">Grain</th>
                <th scope="col">Factory edge</th>
                <th scope="col">Group</th>
                <th scope="col">Notes</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.parts.map((part) => {
                const design = part.design === undefined ? undefined : designs.get(part.design);
                if (design) {
                  return (
                    <tr key={part.id} className="generated">
                      <td data-label="Name" className="wide">{part.name}</td>
                      <td data-label="Length">{formatLength(part.length, units, display)}</td>
                      <td data-label="Width">{formatLength(part.width, units, display)}</td>
                      <td data-label="Qty">{part.quantity}</td>
                      <td data-label="Material">{project.materials.find((material) => material.id === part.material)?.name ?? part.material}</td>
                      <td data-label="Grain">{GRAINS.find((grain) => grain.value === part.grain)?.label}</td>
                      <td data-label="Factory edge">{ruleText(project, part)}</td>
                      <td data-label="Group">{part.group}</td>
                      <td colSpan={2} className="wide">
                        From design:{" "}
                        <button type="button" className="link" onClick={() => onShowDesign?.(design.id)}>
                          {design.name}
                        </button>
                      </td>
                    </tr>
                  );
                }
                const change = (patch: Parameters<typeof updatePart>[2]) => edit((p: Project) => updatePart(p, part.id, patch));
                return (
                  <tr key={part.id}>
                    <td data-label="Name" className="wide">
                      <TextInput
                        aria-label={`Name of ${part.name}`}
                        value={part.name}
                        required
                        // oxlint-disable-next-line jsx-a11y/no-autofocus -- only the row that "Add part" just created gets focus
                        autoFocus={focusId === part.id}
                        onFocus={focusId === part.id ? selectAdded : undefined}
                        onChange={(name) => change({ name })}
                      />
                    </td>
                    <td data-label="Length">
                      <LengthInput aria-label={`Length of ${part.name}`} value={part.length} units={units} display={display} onChange={(length) => length !== undefined && change({ length })} />
                    </td>
                    <td data-label="Width">
                      <LengthInput aria-label={`Width of ${part.name}`} value={part.width} units={units} display={display} onChange={(width) => width !== undefined && change({ width })} />
                    </td>
                    <td data-label="Qty">
                      <NumberInput
                        aria-label={`Quantity of ${part.name}`}
                        className="narrow"
                        value={part.quantity}
                        integer
                        minimum={1}
                        maximum={MAX_PART_QUANTITY}
                        onChange={(quantity) => quantity !== undefined && change({ quantity })}
                      />
                    </td>
                    <td data-label="Material">
                      <select aria-label={`Material of ${part.name}`} value={part.material} onChange={(event) => change({ material: event.target.value })}>
                        {project.materials.map((material) => (
                          <option key={material.id} value={material.id}>
                            {material.name}
                          </option>
                        ))}
                        {!project.materials.some((material) => material.id === part.material) && <option value={part.material}>{part.material} (missing)</option>}
                      </select>
                    </td>
                    <td data-label="Grain">
                      <select aria-label={`Grain of ${part.name}`} value={part.grain} onChange={(event) => change({ grain: event.target.value as Grain })}>
                        {GRAINS.map((grain) => (
                          <option key={grain.value} value={grain.value}>
                            {grain.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Factory edge">
                      <select aria-label={`Factory edge of ${part.name}`} value={part.factoryEdge ?? ""} onChange={(event) => change({ factoryEdge: event.target.value || undefined })}>
                        <option value="">{ruleText(project, part)}</option>
                        <option value="long">Long edge</option>
                        <option value="none">None</option>
                        {part.factoryEdge !== undefined && !isFactoryEdgeChoice(part.factoryEdge) && <option value={part.factoryEdge}>{part.factoryEdge} (not known)</option>}
                      </select>
                    </td>
                    <td data-label="Group">
                      <TextInput aria-label={`Group of ${part.name}`} value={part.group ?? ""} onChange={(group) => change({ group: group || undefined })} />
                    </td>
                    <td data-label="Notes" className="wide">
                      <TextInput aria-label={`Notes for ${part.name}`} value={part.notes ?? ""} onChange={(notes) => change({ notes: notes || undefined })} />
                    </td>
                    <td className="actions">
                      <button type="button" aria-label={`Delete ${part.name}`} onClick={() => edit((p) => removePart(p, part.id))}>
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
      {totals.size > 0 && (
        <ul className="totals" aria-label="Totals">
          {[...totals].map(([material, total]) => (
            <li key={material}>
              {project.materials.find((m) => m.id === material)?.name ?? material}: {total.copies}{" "}
              {total.copies === 1 ? "piece" : "pieces"}, {formatArea(total.area, units)}
            </li>
          ))}
        </ul>
      )}
      {groupColors.length > 0 && (
        <section aria-labelledby="group-colors-title">
          <h3 id="group-colors-title">Group colours in the layout</h3>
          <ul className="color-list">
            {groupColors.map((key) => (
              <li key={key.key}>
                <ColorChoice label={key.label} color={key.color} chosen={key.chosen} onChange={(color) => edit((p) => setGroupColor(p, key.group!, color), `color:${key.key}`)} />
                <GroupRename group={key.group!} onRename={(name) => edit((p) => renameGroup(p, key.group!, name))} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {importing !== null && (
        <CsvImportDialog
          kind="parts"
          text={importing}
          project={project}
          onImport={(next) => {
            edit(next);
            setImporting(null);
          }}
          onClose={() => setImporting(null)}
        />
      )}
    </section>
  );
}
