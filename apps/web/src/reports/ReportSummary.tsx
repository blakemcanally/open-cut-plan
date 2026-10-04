import { formatArea, formatIn, planStats, type ProjectAnalysis } from "@opencutplan/core";
import { useMemo } from "react";
import { formatMoney } from "./money.ts";

export function ReportSummary({ analysis }: { analysis: ProjectAnalysis }) {
  const ctx = analysis.context;
  const stats = useMemo(() => planStats(ctx.project, analysis), [ctx.project, analysis]);
  const items: [string, string][] = [
    ["Sheets", String(stats.sheets)],
    stats.cost === null ? ["Stock area", formatArea(stats.stockArea, ctx.units)] : ["Cost", formatMoney(stats.cost, stats.currency)],
    ...(ctx.features.cutOrder
      ? ([
          ["Cut steps", String(stats.steps)],
          ["Cut length", formatIn(ctx, stats.cutLength)],
        ] as [string, string][])
      : []),
    ["Parts placed", `${stats.placedCopies} of ${stats.copies}`],
  ];
  return (
    <section className="report-summary" aria-labelledby="reports-summary">
      <h2 id="reports-summary" className="visually-hidden">
        Summary
      </h2>
      <dl>
        {items.map(([term, value]) => (
          <div key={term} className={term === "Parts placed" && stats.unplacedCopies > 0 ? "warning" : undefined}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
