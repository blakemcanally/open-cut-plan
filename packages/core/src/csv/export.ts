import Papa from "papaparse";
import type { Project } from "../format/schema.ts";

function decimal(value: number): string {
  return String(Math.round(value * 10_000) / 10_000);
}

function toCsv(fields: string[], data: string[][]): string {
  return `\uFEFF${Papa.unparse({ fields, data }, { newline: "\r\n" })}\r\n`;
}

export function exportPartsCsv(project: Project): string {
  const materialNames = new Map(project.materials.map((material) => [material.id, material.name]));
  return toCsv(
    ["name", "length", "width", "quantity", "material", "grain", "group", "notes"],
    project.parts.map((part) => [
      part.name,
      decimal(part.length),
      decimal(part.width),
      String(part.quantity),
      materialNames.get(part.material) ?? part.material,
      part.grain,
      part.group ?? "",
      part.notes ?? "",
    ]),
  );
}

export function exportStockCsv(project: Project): string {
  const materials = new Map(project.materials.map((material) => [material.id, material]));
  return toCsv(
    ["material", "length", "width", "thickness", "quantity", "cost", "kind", "name"],
    project.stock.map((stock) => {
      const material = materials.get(stock.material);
      return [
        material?.name ?? stock.material,
        decimal(stock.length),
        decimal(stock.width),
        material ? decimal(material.thickness) : "",
        stock.quantity === null ? "unlimited" : String(stock.quantity),
        stock.cost === undefined ? "" : decimal(stock.cost),
        stock.kind,
        stock.name ?? "",
      ];
    }),
  );
}
