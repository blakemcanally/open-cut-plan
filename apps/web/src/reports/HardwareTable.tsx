import type { HardwareLine, Project } from "@opencutplan/core";

interface HardwareTableProps {
  project: Project;
  lines: readonly HardwareLine[];
  level: 2 | 3;
}

function quantityText(line: HardwareLine): string {
  if (line.quantity === null) return "As needed";
  if (line.unit === "each") return String(line.quantity);
  return `${line.quantity} ${line.quantity === 1 ? "pack" : "packs"}`;
}

export function HardwareTable({ project, lines, level }: HardwareTableProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const names = new Map((project.designs ?? []).map((design) => [design.id, design.name]));
  return (
    <section className="hardware" aria-labelledby="hardware-title">
      <Heading id="hardware-title">Hardware</Heading>
      <div className="table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">IKEA article</th>
              <th scope="col">Quantity</th>
              <th scope="col">For</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  {line.name}
                  {line.choices && <span className="muted"> (choose one: {line.choices.map((choice) => `${choice.name}, ${choice.article}`).join("; ")})</span>}
                </td>
                <td>{line.article && (line.source ? <a href={line.source}>{line.article}</a> : line.article)}</td>
                <td>{quantityText(line)}</td>
                <td>{line.design === null ? "Every design" : (names.get(line.design) ?? line.design)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">The article numbers are for IKEA in Great Britain. In another country, find the item by its name.</p>
    </section>
  );
}
