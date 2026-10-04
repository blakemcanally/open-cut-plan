import { cutList, formatArea, formatSize, materialName, type ProjectAnalysis } from "@opencutplan/core";
import { useMemo } from "react";

export function CutListTable({ analysis }: { analysis: ProjectAnalysis }) {
  const ctx = analysis.context;
  const list = useMemo(() => cutList(ctx.project, analysis), [ctx.project, analysis]);
  const edges = list.parts.some((part) => part.factoryEdge !== null);
  if (list.parts.length === 0) return <p className="muted">The project has no parts.</p>;
  return (
    <>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Part</th>
              <th scope="col">Size</th>
              <th scope="col">Quantity</th>
              <th scope="col">Placed</th>
              <th scope="col">Material</th>
              {edges && <th scope="col">Factory edge</th>}
              <th scope="col">Sheets</th>
            </tr>
          </thead>
          <tbody>
            {list.parts.map((part) => (
              <tr key={part.id}>
                <td>{part.name}</td>
                <td>{formatSize(ctx, part)}</td>
                <td>{part.quantity}</td>
                <td className={part.placed < part.quantity ? "warning" : undefined}>{part.placed}</td>
                <td>{materialName(ctx, part.material)}</td>
                {edges && <td>{part.factoryEdge === "long" ? "Long edge" : ""}</td>}
                <td>{part.sheets.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="report-notes muted">
        {list.materials.map((material) => (
          <li key={material.material}>
            {material.name}: {material.parts} {material.parts === 1 ? "part" : "parts"}, {material.copies} {material.copies === 1 ? "copy" : "copies"}, {formatArea(material.partArea, ctx.units)}.
          </li>
        ))}
      </ul>
    </>
  );
}
