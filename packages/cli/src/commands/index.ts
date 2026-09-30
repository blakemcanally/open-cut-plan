import type { CommandSpec, GroupSpec } from "../spec.ts";
import { designGroup } from "./design.ts";
import { exportGroup } from "./export.ts";
import { layoutGroup } from "./layout.ts";
import { materialsGroup } from "./materials.ts";
import { partsGroup } from "./parts.ts";
import { stockGroup } from "./stock.ts";
import { toolsGroup } from "./tools.ts";
import { optimizeCommand } from "./optimize.ts";
import { reportGroup } from "./report.ts";
import { settingsGroup } from "./settings.ts";
import { newCommand, schemaCommand, showCommand, validateCommand } from "./project.ts";

export const COMMANDS: CommandSpec[] = [newCommand, showCommand, validateCommand, optimizeCommand, schemaCommand];

export const GROUPS: GroupSpec[] = [partsGroup, stockGroup, materialsGroup, toolsGroup, designGroup, settingsGroup, layoutGroup, reportGroup, exportGroup];
