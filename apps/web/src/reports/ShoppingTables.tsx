import { formatSize, stockLabel, type ProjectAnalysis, type ShoppingLine } from "@opencutplan/core";
import { formatMoney, formatPercent } from "./money.ts";

interface ShoppingTablesProps {
  analysis: ProjectAnalysis;
  /** The heading level of each material. */
  level: 2 | 3;
}

export function ShoppingTables({ analysis, level }: ShoppingTablesProps) {
  const { shopping, context: ctx } = analysis;
  const Heading = level === 2 ? "h2" : "h3";
  const cost = ctx.features.cost;
  const money = (value: number | null) => (value === null ? "—" : formatMoney(value, shopping.currency));

  if (shopping.materials.length === 0) return <p className="muted">The plan uses no stock.</p>;

  const stockText = (line: ShoppingLine) => {
    const name = ctx.stock.get(line.stock)?.name;
    return name ? `${name}, ${formatSize(ctx, line)}` : formatSize(ctx, line);
  };
  const missing = shopping.missingPrices.map((id) => {
    const stock = ctx.stock.get(id);
    return stock ? stockLabel(ctx, stock) : id;
  });

  return (
    <div className="shopping">
      {shopping.materials.map((material) => (
        <section key={material.material} className="shopping-material">
          <Heading>{material.name}</Heading>
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th scope="col">Stock</th>
                  <th scope="col">In the plan</th>
                  <th scope="col">To buy</th>
                  {cost && <th scope="col">Unit cost</th>}
                  {cost && <th scope="col">Cost</th>}
                </tr>
              </thead>
              <tbody>
                {material.lines.map((line) => (
                  <tr key={line.stock}>
                    <td>
                      {stockText(line)}
                      {line.kind === "offcut" ? " (offcut you have)" : ""}
                    </td>
                    <td>{line.used}</td>
                    <td>{line.buy}</td>
                    {cost && <td>{money(line.unitCost)}</td>}
                    {cost && <td>{money(line.lineCost)}</td>}
                  </tr>
                ))}
              </tbody>
              {cost && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4}>
                      Subtotal
                    </th>
                    <td>{money(material.cost)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="muted">
            Parts use {formatPercent(material.utilization)} of this stock. Waste is {formatPercent(1 - material.utilization)}.
          </p>
        </section>
      ))}
      {cost &&
        (shopping.total !== null ? (
          <p className="shopping-total">Total: {money(shopping.total)}</p>
        ) : (
          <p className="warning">⚠ The total is not known. This stock has no price: {missing.join(", ")}.</p>
        ))}
    </div>
  );
}

export function SheetUseTable({ analysis }: { analysis: ProjectAnalysis }) {
  const { shopping, context: ctx } = analysis;
  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            <th scope="col">Sheet</th>
            <th scope="col">Stock</th>
            <th scope="col">Parts use</th>
          </tr>
        </thead>
        <tbody>
          {shopping.sheets.map((sheet) => {
            const stock = ctx.stock.get(sheet.stock);
            return (
              <tr key={sheet.sheet}>
                <td>{sheet.sheetNumber}</td>
                <td>{stock ? stockLabel(ctx, stock) : sheet.stock}</td>
                <td>{formatPercent(sheet.utilization)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
