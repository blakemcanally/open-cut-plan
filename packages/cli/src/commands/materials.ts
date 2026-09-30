import { materialInUse, removeMaterial, updateMaterial, type Material, type Patch, type Project } from "@opencutplan/core";
import { PROGRAM } from "../help.ts";
import { FILE_ARG, finishMutation, loadProject, OUTPUT_OPTIONS, warningLines } from "../project.ts";
import { CliError, EXIT, type CommandSpec, type GroupSpec } from "../spec.ts";
import { len, table } from "../text.ts";
import { optionalBoolean, optionalLength, str } from "../values.ts";
import { assertNoConflict, findAll, findById, ID_OPTION, newId, nonEmpty, unsetFields, unsetOption } from "./common.ts";

function usedBy(project: Project, id: string) {
  return {
    parts: project.parts.filter((part) => part.material === id).map((part) => part.id),
    stock: project.stock.filter((stock) => stock.material === id).map((stock) => stock.id),
    designs: (project.designs ?? []).filter((design) => design.material === id || design.back?.material === id).map((design) => design.id),
  };
}

function listed(project: Project, material: Material) {
  const users = usedBy(project, material.id);
  return { ...material, usedBy: { parts: users.parts.length, stock: users.stock.length, designs: users.designs.length } };
}

function line(project: Project, material: Material): string {
  return `${material.id} (${material.name}, ${len(project, material.thickness)}${material.grained ? ", grained" : ""})`;
}

const FIELD_OPTIONS = {
  name: { name: "name", type: "string", value: "<text>", description: "The name, for example \"Baltic birch 18mm\"." },
  thickness: { name: "thickness", type: "string", value: "<length>", description: "The actual thickness, not the nominal one." },
  grained: { name: "grained", type: "string", value: "<true|false>", description: "true when the face has a grain or pattern direction. Default for add: true." },
  color: { name: "color", type: "string", value: "<css>", description: "A display colour (a CSS colour string)." },
} as const;

const list: CommandSpec = {
  name: "materials list",
  summary: "List the materials.",
  description: "List the materials with the number of parts, stock items, and designs that use each one.",
  args: [FILE_ARG],
  options: [],
  examples: [{ command: `${PROGRAM} materials list shelf.cutplan.json --json`, description: "List the materials as JSON." }],
  output: "units, materials [{ id, name, thickness, grained, color?, usedBy { parts, stock, designs } }]. usedBy is derived; it is not a file field.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const materials = project.materials.map((material) => listed(project, material));
    const text = table(
      ["id", "name", "thickness", "grained", "color", "parts", "stock", "designs"],
      materials.map((m) => [m.id, m.name, len(project, m.thickness), String(m.grained), m.color ?? "", String(m.usedBy.parts), String(m.usedBy.stock), String(m.usedBy.designs)]),
    );
    return { data: { units: project.project.units, materials }, text, warnings: warningLines(loaded) };
  },
};

const get: CommandSpec = {
  name: "materials get",
  summary: "Show one material.",
  description: "Show one material by id, with the ids of the parts, stock, and designs that use it.",
  args: [FILE_ARG, { name: "id", description: "The material id." }],
  options: [],
  examples: [{ command: `${PROGRAM} materials get shelf.cutplan.json bb18 --json`, description: "Show the material bb18." }],
  output: "units, material { id, name, thickness, grained, color? }, usedBy { parts: [ids], stock: [ids], designs: [ids] }.",
  async run({ args, io }) {
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const material = findById(project.materials, args[1]!, "material");
    const users = usedBy(project, material.id);
    const text = [line(project, material), `Used by parts: ${users.parts.join(", ") || "none"}.`, `Used by stock: ${users.stock.join(", ") || "none"}.`, `Used by designs: ${users.designs.join(", ") || "none"}.`].join("\n");
    return { data: { units: project.project.units, material, usedBy: users }, text, warnings: warningLines(loaded) };
  },
};

const add: CommandSpec = {
  name: "materials add",
  summary: "Add a material.",
  description: "Add a material. Parts and stock refer to it by its id.",
  args: [FILE_ARG],
  options: [{ ...FIELD_OPTIONS.name, required: true }, { ...FIELD_OPTIONS.thickness, required: true }, FIELD_OPTIONS.grained, FIELD_OPTIONS.color, ID_OPTION, ...OUTPUT_OPTIONS],
  examples: [
    { command: `${PROGRAM} materials add shelf.cutplan.json --name "Baltic birch 18mm" --thickness 18mm`, description: "Add a grained material; the id is baltic-birch-18mm." },
    { command: `${PROGRAM} materials add shelf.cutplan.json --name MDF --thickness 3/4 --grained false --id mdf`, description: "Add MDF with the id mdf." },
  ],
  output: "material (the new material), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const units = project.project.units;
    const name = nonEmpty(str(options, "name"), "name")!;
    const material: Material = {
      id: newId(project.materials, str(options, "id"), name, "material"),
      name,
      thickness: optionalLength(options, "thickness", units)!,
      grained: optionalBoolean(options, "grained") ?? true,
    };
    const color = str(options, "color");
    if (color !== undefined) material.color = color;
    const next = { ...project, materials: [...project.materials, material] };
    return finishMutation(invocation, loaded, next, { summary: `Added material ${line(project, material)}.`, data: { material } });
  },
};

const set: CommandSpec = {
  name: "materials set",
  summary: "Change a material.",
  description: "Change the fields of a material. Only the fields you give change. The id does not change.",
  args: [FILE_ARG, { name: "id", description: "The material id." }],
  options: [FIELD_OPTIONS.name, FIELD_OPTIONS.thickness, FIELD_OPTIONS.grained, FIELD_OPTIONS.color, unsetOption(["color"]), ...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} materials set shelf.cutplan.json bb6 --thickness 1/4 --grained false`, description: "Change the thickness and the grain." }],
  output: "material (after the change), changes, validation, written, dryRun.",
  async run(invocation) {
    const { args, options, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const units = project.project.units;
    const old = findById(project.materials, args[1]!, "material");
    const unset = unsetFields(options, ["color"] as const);
    assertNoConflict(options, ["color"], unset);
    const patch: Patch<Material> = {};
    const name = nonEmpty(str(options, "name"), "name");
    if (name !== undefined) patch.name = name;
    const thickness = optionalLength(options, "thickness", units);
    if (thickness !== undefined) patch.thickness = thickness;
    const grained = optionalBoolean(options, "grained");
    if (grained !== undefined) patch.grained = grained;
    const color = str(options, "color");
    if (color !== undefined) patch.color = color;
    for (const field of unset) patch[field] = undefined;
    const next = updateMaterial(project, old.id, patch);
    const material = findById(next.materials, old.id, "material");
    return finishMutation(invocation, loaded, next, { summary: `Changed material ${line(next, material)}.`, data: { material } });
  },
};

const remove: CommandSpec = {
  name: "materials remove",
  summary: "Remove materials that no part or stock uses.",
  description: "Remove one or more materials. A material that a part, a stock item, or a design uses cannot be removed (exit 1); change or remove those first. Nothing is removed when any id fails.",
  args: [FILE_ARG, { name: "id", description: "A material id.", variadic: true }],
  options: [...OUTPUT_OPTIONS],
  examples: [{ command: `${PROGRAM} materials remove shelf.cutplan.json spare-ply`, description: "Remove an unused material." }],
  output: "removed (the ids), changes, validation, written, dryRun. For a material in use: error { code: \"in-use\", id, parts, stock, designs }.",
  async run(invocation) {
    const { args, io } = invocation;
    const loaded = await loadProject(io, args[0]!);
    const { project } = loaded;
    const materials = findAll(project.materials, args.slice(1), "material");
    let next = project;
    for (const material of materials) {
      if (materialInUse(project, material.id)) {
        const users = usedBy(project, material.id);
        throw new CliError(EXIT.failed, "in-use", `The material ${material.id} is in use by ${users.parts.length} parts, ${users.stock.length} stock items, and ${users.designs.length} designs.`, {
          id: material.id,
          ...users,
        });
      }
      next = removeMaterial(next, material.id);
    }
    const removed = materials.map((material) => material.id);
    return finishMutation(invocation, loaded, next, { summary: `Removed material ${removed.join(", ")}.`, data: { removed } });
  },
};

export const materialsGroup: GroupSpec = { name: "materials", summary: "Materials (sheet goods)", commands: [list, get, add, set, remove] };
