import { planContext, type PlanContext, type Project } from "@opencutplan/core";

const cache = new WeakMap<Project, PlanContext>();

export function planContextOf(project: Project): PlanContext {
  let ctx = cache.get(project);
  if (!ctx) {
    ctx = planContext(project);
    cache.set(project, ctx);
  }
  return ctx;
}
