import { analyzeProject, parseProject, sequencePlan, serializeProject, type Project } from "@opencutplan/core";
import { describe, expect, it } from "vitest";
import {
  APP_EXTENSION,
  assemblyCount,
  assemblyGroups,
  assemblyKey,
  assemblyState,
  chooseOrder,
  chooseTool,
  keepAssemblyProgress,
  keepProgress,
  readProgress,
  sequenceKey,
  setAssemblyStepDone,
  setStepDone,
  shopState,
  writeProgress,
} from "../src/shop/progress.ts";
import { EXAMPLES } from "../src/examples.ts";
import { designProject, sampleProject } from "./helpers.ts";

const stepsOf = (project: Project) => analyzeProject(project).steps;

function moved(project: Project): Project {
  const next = structuredClone(project);
  next.plan!.sheets[0]!.placements[1]!.y = 20;
  return next;
}

describe("sequenceKey", () => {
  it("is the same for the same steps and changes when a cut moves", () => {
    const project = sampleProject();
    expect(sequenceKey(stepsOf(project))).toBe(sequenceKey(stepsOf(structuredClone(project))));
    expect(sequenceKey(stepsOf(moved(project)))).not.toBe(sequenceKey(stepsOf(project)));
    expect(sequenceKey([])).toBe("0-811c9dc5");
  });
});

describe("shop progress", () => {
  it("ticks and unticks steps, and removes the progress when no step is ticked", () => {
    const project = sampleProject();
    const steps = stepsOf(project);
    const ticked = setStepDone(setStepDone(project, steps, 3, true), steps, 1, true);
    expect(readProgress(ticked)).toEqual({ sequence: sequenceKey(steps), done: [1, 3] });
    expect([...shopState(ticked, steps).done]).toEqual([1, 3]);
    const cleared = setStepDone(setStepDone(ticked, steps, 1, false), steps, 3, false);
    expect(cleared.extensions).toBeUndefined();
    expect(project.extensions).toBeUndefined();
  });

  it("keeps other extension data", () => {
    const project: Project = { ...sampleProject(), extensions: { "com.example": { a: 1 }, [APP_EXTENSION]: { theme: "dark" } } };
    const steps = stepsOf(project);
    const ticked = setStepDone(project, steps, 2, true);
    expect(ticked.extensions).toEqual({ "com.example": { a: 1 }, [APP_EXTENSION]: { theme: "dark", progress: { sequence: sequenceKey(steps), done: [2] } } });
    expect(writeProgress(ticked, null).extensions).toEqual(project.extensions);
  });

  it("survives saving and opening the file", () => {
    const project = sampleProject();
    const ticked = setStepDone(project, stepsOf(project), 2, true);
    const reopened = parseProject(serializeProject(ticked));
    if (!reopened.ok) throw new Error("the file did not parse");
    expect([...shopState(reopened.project, stepsOf(reopened.project)).done]).toEqual([2]);
  });

  it("marks the ticks stale when the sequence changes, until the user keeps or clears them", () => {
    const project = sampleProject();
    const ticked = setStepDone(project, stepsOf(project), 2, true);
    const edited = moved(ticked);
    const steps = stepsOf(edited);
    expect(shopState(edited, steps)).toMatchObject({ stale: true, done: new Set() });
    expect(shopState(keepProgress(edited, steps), steps)).toMatchObject({ stale: false, done: new Set([2]) });
    expect(shopState(writeProgress(edited, null), steps)).toMatchObject({ stale: false, done: new Set() });
  });

  it("ignores malformed progress and step numbers past the end", () => {
    const steps = stepsOf(sampleProject());
    const bad: Project = { ...sampleProject(), extensions: { [APP_EXTENSION]: { progress: { sequence: 3, done: "1" } } } };
    expect(readProgress(bad)).toBeNull();
    const extra = writeProgress(sampleProject(), { sequence: sequenceKey(steps), done: [1, 0, 2.5, 99] });
    expect([...shopState(extra, steps).done]).toEqual([1]);
  });
});

describe("assembly progress", () => {
  it("numbers the steps of every design that can make parts, in design order", () => {
    const project = designProject();
    const second = { ...project.designs![0]!, id: "two", name: "Two" };
    const broken = { ...project.designs![0]!, id: "broken", name: "Broken", material: "ply6" };
    const groups = assemblyGroups({ ...project, designs: [...project.designs!, broken, second] });
    expect(groups.map((group) => [group.design, group.start, group.steps.length])).toEqual([
      ["hall", 1, 9],
      ["two", 10, 9],
    ]);
    expect(assemblyCount(groups)).toBe(18);
  });

  it("stores its ticks apart from the cut ticks, and a change to the steps makes them stale", () => {
    const project = designProject();
    const groups = assemblyGroups(project);
    const steps = stepsOf(project);
    const ticked = setAssemblyStepDone(setStepDone(project, steps, 1, true), groups, 2, true);
    expect(readProgress(ticked, "assemblyProgress")).toEqual({ sequence: assemblyKey(groups), done: [2] });
    expect(readProgress(ticked)?.done).toEqual([1]);

    const taller = { ...ticked, designs: [{ ...ticked.designs![0]!, height: { openings: [335, 400] } }] };
    const changed = assemblyGroups(taller);
    expect(assemblyKey(changed)).not.toBe(assemblyKey(groups));
    expect(assemblyState(taller, changed)).toMatchObject({ stale: true, done: new Set() });
    const kept = keepAssemblyProgress(taller, changed);
    expect(assemblyState(kept, changed)).toMatchObject({ stale: false, done: new Set([2]) });
    expect(readProgress(kept)?.done).toEqual([1]);
    expect(writeProgress(kept, null, "assemblyProgress").extensions).toEqual({ [APP_EXTENSION]: { progress: readProgress(ticked) } });
  });

  it("takes the fingerprint from the text of the steps only, so the boards of a step do not make old ticks stale", () => {
    const groups = assemblyGroups(designProject());
    const text = groups.map((group) => ({ ...group, steps: group.steps.map(({ title, body }) => ({ title, body })) }));
    expect(groups[0]!.steps[4]!.boards).toHaveLength(3);
    expect(assemblyKey(groups)).toBe(assemblyKey(text));
  });
});

describe("chooseTool", () => {
  it("keeps each tick on its cut when a change of tool moves the steps", () => {
    const parsed = parseProject(EXAMPLES[0]!.text);
    if (!parsed.ok) throw new Error("example did not load");
    const project: Project = { ...parsed.project, settings: { ...parsed.project.settings, orderMode: "setup" } };
    project.tools = [...project.tools, { id: "track", name: "Track saw", type: "track-saw", kerf: project.tools[0]!.kerf, enabled: true }];
    const before = sequencePlan(project);
    const cutKey = (s: (typeof before)[number]) => [s.sheet, s.kind, s.axis, s.at, s.from, s.to].join(",");
    let ticked = project;
    for (const step of before.filter((s) => s.step % 2 === 1)) ticked = setStepDone(ticked, before, step.step, true);
    const moving = before.find((step) => {
      const after = sequencePlan(chooseTool(ticked, before, step, "track"));
      return after.some((s, i) => cutKey(s) !== cutKey(before[i]!));
    });
    expect(moving).toBeDefined();
    const next = chooseTool(ticked, before, moving!, "track");
    const after = sequencePlan(next);
    const tickedCuts = new Set(before.filter((s) => s.step % 2 === 1).map(cutKey));
    expect(readProgress(next)!.done).toEqual(after.filter((s) => tickedCuts.has(cutKey(s))).map((s) => s.step));
    expect(shopState(next, after).stale).toBe(false);
  });

  it("leaves old ticks as they are when they are already out of date", () => {
    const project = sampleProject();
    project.tools.push({ id: "track", name: "Track saw", type: "track-saw", kerf: 0.125, enabled: true });
    const steps = stepsOf(project);
    const ticked = writeProgress(project, { sequence: "0-old", done: [1] });
    const next = chooseTool(ticked, steps, steps[4]!, "track");
    expect(readProgress(next)).toEqual({ sequence: "0-old", done: [1] });
    expect(next.plan!.sheets[0]!.toolChoices).toHaveLength(1);
  });
});

describe("chooseOrder", () => {
  it("sets the order and keeps each tick on its cut", () => {
    const parsed = parseProject(EXAMPLES[0]!.text);
    if (!parsed.ok) throw new Error("example did not load");
    const project = parsed.project;
    const before = sequencePlan(project);
    const ticked = setStepDone(setStepDone(project, before, 5, true), before, 6, true);
    const cutKey = (s: (typeof before)[number]) => [s.sheet, s.kind, s.axis, s.at, s.from, s.to].join(",");
    const cuts = new Set([before[4]!, before[5]!].map(cutKey));
    const next = chooseOrder(ticked, "setup");
    expect(next.settings.orderMode).toBe("setup");
    const after = sequencePlan(next);
    const done = after.filter((s) => cuts.has(cutKey(s))).map((s) => s.step);
    expect(done).not.toEqual([5, 6]);
    expect(readProgress(next)!.done).toEqual(done);
    expect(shopState(next, after).stale).toBe(false);
    expect(readProgress(chooseOrder(next, "sheet"))!.done).toEqual([5, 6]);
  });

  it("leaves the ticks as they are when there are none", () => {
    const next = chooseOrder(sampleProject(), "setup");
    expect(next.settings.orderMode).toBe("setup");
    expect(readProgress(next)).toBeNull();
  });
});
