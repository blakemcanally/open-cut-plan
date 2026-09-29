import { errorIssue, warningIssue, type Issue, type IssuePath } from "./issues.ts";
import type { Project } from "./schema.ts";

type IssueMaker = typeof errorIssue;

function collectIds(items: readonly { id: string }[], path: readonly string[], issues: Issue[], issue: IssueMaker = errorIssue): Set<string> {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      issues.push(issue("duplicate-id", `The id "${item.id}" is used more than once in ${path.join(".")}.`, [...path, index, "id"]));
    }
    seen.add(item.id);
  });
  return seen;
}

/** Problems in `plan` are warnings, so a file with a stale plan still loads; all other problems are errors. */
export function checkReferences(project: Project): Issue[] {
  const issues: Issue[] = [];
  const materials = collectIds(project.materials, ["materials"], issues);
  const stock = collectIds(project.stock, ["stock"], issues);
  collectIds(project.parts, ["parts"], issues);
  const tools = collectIds(project.tools, ["tools"], issues);
  const designs = collectIds(project.designs ?? [], ["designs"], issues);
  const parts = new Map(project.parts.map((part) => [part.id, part]));

  project.stock.forEach((item, index) => {
    if (!materials.has(item.material)) {
      issues.push(errorIssue("bad-ref", `Stock "${item.id}" uses material "${item.material}", which does not exist.`, ["stock", index, "material"]));
    }
  });
  project.parts.forEach((part, index) => {
    if (!materials.has(part.material)) {
      issues.push(errorIssue("bad-ref", `Part "${part.name}" uses material "${part.material}", which does not exist.`, ["parts", index, "material"]));
    }
  });
  project.parts.forEach((part, index) => {
    if (part.design !== undefined && !designs.has(part.design)) {
      issues.push(
        warningIssue("design-missing", `Part "${part.name}" names design "${part.design}", which does not exist. The part works as a normal part.`, [
          "parts",
          index,
          "design",
        ]),
      );
    }
  });

  const sheets = project.plan?.sheets ?? [];
  collectIds(sheets, ["plan", "sheets"], issues, warningIssue);
  const placed = new Set<string>();
  sheets.forEach((sheet, sheetIndex) => {
    const base: IssuePath = ["plan", "sheets", sheetIndex];
    if (!stock.has(sheet.stock)) {
      issues.push(warningIssue("bad-ref", `Sheet "${sheet.id}" uses stock "${sheet.stock}", which does not exist.`, [...base, "stock"]));
    }
    sheet.placements.forEach((placement, placementIndex) => {
      const path: IssuePath = [...base, "placements", placementIndex];
      const part = parts.get(placement.part);
      if (!part) {
        issues.push(warningIssue("bad-ref", `Sheet "${sheet.id}" places part "${placement.part}", which does not exist.`, [...path, "part"]));
        return;
      }
      if (placement.copy >= part.quantity) {
        issues.push(
          warningIssue(
            "bad-copy",
            `Sheet "${sheet.id}" places copy ${placement.copy + 1} of "${part.name}", but its quantity is ${part.quantity}.`,
            [...path, "copy"],
          ),
        );
        return;
      }
      const key = `${placement.part}#${placement.copy}`;
      if (placed.has(key)) {
        issues.push(warningIssue("duplicate-placement", `Copy ${placement.copy + 1} of "${part.name}" is placed more than once.`, path));
      }
      placed.add(key);
    });
    (sheet.cuts ?? []).forEach((cut, cutIndex) => {
      if (cut.tool !== undefined && !tools.has(cut.tool)) {
        issues.push(
          warningIssue("bad-ref", `Cut ${cut.step} on sheet "${sheet.id}" uses tool "${cut.tool}", which does not exist.`, [...base, "cuts", cutIndex, "tool"]),
        );
      }
    });
  });

  return issues;
}
