import { CATALOG_FAMILIES, catalogFor, catalogMaterial, catalogSize, formatExactLength, formatLength, slugify, UnitsSchema, type CatalogMaterial, type CatalogSize, type Units } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { usageError, type CommandSpec, type GroupSpec, type OptionSpec, type OptionValues } from "../spec.ts";
import { money, table } from "../text.ts";
import { optionalChoice, str } from "../values.ts";

const CATALOG_DISPLAY = { inch: "decimal", mm: 0.1 } as const;

export const PRICE_NOTE = "Prices are typical: the median price from the store web sites on the date shown. Check the price before you buy.";

export function catalogOption(target: "material" | "size"): OptionSpec {
  return target === "material"
    ? { name: "catalog", type: "string", value: "<id>", description: "A catalogue material id (see catalog list). It sets the name, the thickness, and the grain." }
    : { name: "catalog", type: "string", value: "<size id>", description: "A catalogue size id (see catalog list). It sets the material and the size, and the cost to the typical price in a USD project." };
}

function unknownCatalog(id: string, noun: string) {
  return usageError(`There is no catalogue ${noun} with the id "${id}". Run '${PROGRAM} catalog list' to see the ids.`, "not-found", { option: "catalog", id });
}

export function catalogMaterialArg(id: string): CatalogMaterial {
  const material = catalogMaterial(id);
  if (!material) throw unknownCatalog(id, "material");
  return material;
}

export function catalogSizeArg(id: string): { material: CatalogMaterial; size: CatalogSize } {
  const found = catalogSize(id);
  if (!found) throw unknownCatalog(id, "size");
  return found;
}

export function assertNoCatalogConflict(options: OptionValues, names: readonly string[]): void {
  for (const name of names) {
    if (options[name] !== undefined) throw usageError(`Give --catalog or --${name}, not both. --catalog sets the ${name}.`, "conflict", { option: name });
  }
}

function familyArg(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const key = slugify(text);
  const family = CATALOG_FAMILIES.find((candidate) => slugify(candidate) === key);
  if (family) return family;
  throw usageError(`--family "${text}" is not a catalogue family. Known families: ${CATALOG_FAMILIES.join(", ")}.`, "invalid-value", { option: "family", value: text, known: [...CATALOG_FAMILIES] });
}

const list: CommandSpec = {
  name: "catalog list",
  summary: "List the catalogue of common sheet goods.",
  description:
    "List the catalogue of common sheet goods: the materials, their actual thickness, and their sheet sizes, with a typical price. The prices come from the Home Depot and Lowe's web sites, read by hand on the date shown, and are approximate. The typical price is the median of the listings with a price; with an even number, it is the mean of the two middle prices. The command needs no file. Use the ids with materials add --catalog and stock add --catalog.",
  args: [],
  options: [
    { name: "family", type: "string", value: "<name>", description: `Only this family, for example MDF or hardwood-plywood. The families: ${CATALOG_FAMILIES.join(", ")}.` },
    { name: "units", type: "string", value: "<in|mm>", description: "The units of the thickness and the sizes. Default: in." },
  ],
  examples: [
    { command: `${PROGRAM} catalog list --family mdf`, description: "List the MDF sheets in inches." },
    { command: `${PROGRAM} catalog list --units mm --json`, description: "Get the full catalogue in millimetres as JSON." },
  ],
  output:
    "units, families, materials [{ id, family, name, nominal, thickness, grained, notes, sizes [{ id, label, length, width, price { usd, count (the listings with a price), store and source (the listing that has the price; null for the mean of the two middle prices), checked } (null when no price is known), listings [{ store, priceUsd, source, checked }] }] }].",
  async run({ options }) {
    const units: Units = optionalChoice(options, "units", UnitsSchema.options) ?? "in";
    const family = familyArg(str(options, "family"));
    const materials = catalogFor(units, family);
    const show = (value: number) => formatLength(value, units, CATALOG_DISPLAY);
    const rows = materials.flatMap((material) =>
      material.sizes.map((size) => [
        size.id,
        material.name,
        formatExactLength(material.thickness, units),
        `${size.label}: ${show(size.length)} × ${show(size.width)}`,
        size.price ? `${money(size.price.usd, "USD")} (${size.price.store ?? `median of ${size.price.count} listings`}, checked ${size.price.checked})` : "no price found",
      ]),
    );
    const text = `${table(["size id", "material", "thickness", "size", "typical price"], rows)}\n\n${PRICE_NOTE}`;
    return { data: { units, families: family === undefined ? CATALOG_FAMILIES : [family], materials }, text };
  },
};

export const catalogGroup: GroupSpec = { name: "catalog", summary: "Catalogue of common sheet goods", commands: [list] };
