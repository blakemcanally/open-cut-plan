import { stageColor, TOOL_WARNING_COLOR, toolWarning, type CutColoring, type Step, type ToolColors } from "@opencutplan/core";
import { useId } from "react";

interface CutLegendProps {
  coloring: CutColoring;
  tools: ToolColors;
  steps: readonly Step[];
  onColoring(coloring: CutColoring): void;
}

const CHOICES: readonly { value: CutColoring; label: string }[] = [
  { value: "stage", label: "Stage" },
  { value: "tool", label: "Tool" },
];

export function CutLegend({ coloring, tools, steps, onColoring }: CutLegendProps) {
  const name = useId();
  if (steps.length === 0) return null;
  const items =
    coloring === "tool"
      ? [
          ...tools.legend.map((entry) => ({ key: entry.tool, label: entry.name, color: entry.color })),
          ...(steps.some(toolWarning) ? [{ key: "warning", label: "No tool, or over a tool limit", color: TOOL_WARNING_COLOR }] : []),
        ]
      : [...new Set(steps.map((step) => step.stage))]
          .sort((a, b) => a - b)
          .map((stage) => ({ key: `stage-${stage}`, label: `Stage ${stage}`, color: stageColor(stage) }));
  return (
    <section className="cut-legend" aria-labelledby="cut-legend-title">
      <h3 id="cut-legend-title">Cut lines</h3>
      <fieldset className="choice">
        <legend>Colour cuts by</legend>
        {CHOICES.map((choice) => (
          <label key={choice.value}>
            <input type="radio" name={name} checked={coloring === choice.value} onChange={() => onColoring(choice.value)} />
            {choice.label}
          </label>
        ))}
      </fieldset>
      <ul className="legend" aria-label="Cut colours">
        {items.map((item) => (
          <li key={item.key}>
            <span className="swatch" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="muted">Click a cut number to open its step on the Cut tab.</p>
    </section>
  );
}
