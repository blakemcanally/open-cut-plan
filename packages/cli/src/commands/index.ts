import type { CommandSpec, GroupSpec } from "../spec.ts";
import { designGroup } from "./design.ts";
import { exportGroup } from "./export.ts";
import { layoutGroup } from "./layout.ts";
import { materialsGroup } from "./materials.ts";
import { partsGroup } from "./parts.ts";
import { stockGroup } from "./stock.ts";
import { toolsGroup } from "./tools.ts";
import { optimizeCommand } from "./optimize.ts";
import { optimizeCutsCommand } from "./optimizeCuts.ts";
import { reportGroup } from "./report.ts";
import { catalogGroup } from "./catalog.ts";
import { settingsGroup } from "./settings.ts";
import { newCommand, schemaCommand, showCommand, validateCommand } from "./project.ts";

export const COMMANDS: CommandSpec[] = [newCommand, showCommand, validateCommand, optimizeCommand, optimizeCutsCommand, schemaCommand];

export const GROUPS: GroupSpec[] = [partsGroup, stockGroup, materialsGroup, catalogGroup, toolsGroup, designGroup, settingsGroup, layoutGroup, reportGroup, exportGroup];
