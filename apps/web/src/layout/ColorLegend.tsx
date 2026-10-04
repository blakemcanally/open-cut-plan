import type { PartColors } from "@opencutplan/core";

export function ColorLegend({ colors }: { colors: PartColors }) {
  if (colors.legend.length === 0) return null;
  return (
    <section aria-labelledby="legend-title">
      <h3 id="legend-title">Colours</h3>
      <ul className="legend" aria-labelledby="legend-title">
        {colors.legend.map((key) => (
          <li key={key.key}>
            <span className="swatch" style={{ background: key.color }} />
            {key.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
