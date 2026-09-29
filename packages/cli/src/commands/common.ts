import { slugify, uniqueId, type Material, type Project } from "@opencutplan/core";
import { usageError, type OptionSpec, type OptionValues } from "../spec.ts";
import { list } from "../values.ts";

export function findById<T extends { id: string }>(items: readonly T[], id: string, noun: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (item) return item;
  const known = items.map((candidate) => candidate.id);
  throw usageError(`There is no ${noun} with the id "${id}". ${known.length > 0 ? `Known ids: ${known.join(", ")}.` : `The project has no ${noun}.`}`, "not-found", {
    id,
    known,
  });
}

export function findAll<T extends { id: string }>(items: readonly T[], ids: readonly string[], noun: string): T[] {
  return [...new Set(ids)].map((id) => findById(items, id, noun));
}

/** A material by id, or else by name without case when exactly one material has that name. */
export function resolveMaterial(project: Project, text: string): Material {
  const byId = project.materials.find((material) => material.id === text);
  if (byId) return byId;
  const named = project.materials.filter((material) => material.name.trim().toLowerCase() === text.trim().toLowerCase());
  if (named.length === 1) return named[0]!;
  if (named.length > 1) {
    throw usageError(`More than one material is named "${text}". Use an id: ${named.map((m) => m.id).join(", ")}.`, "ambiguous", { value: text });
  }
  return findById(project.materials, text, "material");
}

/** The material for a new part or stock: --material, or the only material when the project has exactly one. */
export function materialFor(project: Project, text: string | undefined): Material {
  if (text !== undefined) return resolveMaterial(project, text);
  if (project.materials.length === 1) return project.materials[0]!;
  throw usageError(
    project.materials.length === 0
      ? "The project has no materials. Add one first with 'opencutplan materials add'."
      : `Give --material. The project has more than one material: ${project.materials.map((m) => m.id).join(", ")}.`,
    "missing-option",
    { option: "material" },
  );
}

export function newId(items: readonly { id: string }[], requested: string | undefined, base: string, noun: string): string {
  const taken = new Set(items.map((item) => item.id));
  if (requested === undefined) return uniqueId(slugify(base), taken);
  if (requested.trim() === "") throw usageError("--id must not be empty.", "invalid-value", { option: "id" });
  if (taken.has(requested)) throw usageError(`The ${noun} id "${requested}" is in use.`, "duplicate-id", { id: requested });
  return requested;
}

export function nonEmpty(text: string | undefined, name: string): string | undefined {
  if (text !== undefined && text.trim() === "") throw usageError(`--${name} must not be empty.`, "invalid-value", { option: name });
  return text;
}

export const ID_OPTION: OptionSpec = { name: "id", type: "string", value: "<id>", description: "The id. Default: made from the name, as the app does." };

export function unsetOption(fields: readonly string[]): OptionSpec {
  return { name: "unset", type: "string", value: "<field>", multiple: true, description: `Remove an optional field: ${fields.join(", ")}.` };
}

export function unsetFields<F extends string>(options: OptionValues, allowed: readonly F[]): F[] {
  const fields = list(options, "unset");
  for (const field of fields) {
    if (!(allowed as readonly string[]).includes(field)) {
      throw usageError(`--unset ${field} is not possible. Fields that can be removed: ${allowed.join(", ")}.`, "invalid-value", { option: "unset", value: field });
    }
  }
  return fields as F[];
}

export function assertNoConflict(options: OptionValues, fields: readonly string[], unset: readonly string[]): void {
  for (const field of unset) {
    if (fields.includes(field) && options[field] !== undefined) throw usageError(`Give --${field} or --unset ${field}, not both.`, "conflict", { option: field });
  }
}
