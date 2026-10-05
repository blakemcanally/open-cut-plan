import { catalogThicknesses, formatExactLength, sameThickness, type Units } from "@opencutplan/core";

interface ThicknessPickerProps {
  /** The material name, for the accessible name. */
  name: string;
  value: number | undefined;
  units: Units;
  onPick(thickness: number): void;
}

export function ThicknessPicker({ name, value, units, onPick }: ThicknessPickerProps) {
  const groups = catalogThicknesses(units);
  const keyed = groups.flatMap((group, g) => group.options.map((option, o) => ({ key: `${g}-${o}`, option })));
  const selected = value === undefined ? "" : (keyed.find(({ option }) => sameThickness(option.thickness, value, units))?.key ?? "");
  return (
    <select
      className="thickness-picker"
      aria-label={`Pick the thickness of ${name}`}
      value={selected}
      onChange={(event) => {
        const found = keyed.find(({ key }) => key === event.target.value);
        if (found) onPick(found.option.thickness);
      }}
    >
      <option value="">Pick…</option>
      {groups.map((group, g) => (
        <optgroup key={group.family} label={group.family}>
          {group.options.map((option, o) => (
            <option key={`${g}-${o}`} value={`${g}-${o}`}>
              {`${option.nominal} → ${formatExactLength(option.thickness, units)} (${option.materials.join(", ")})`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
