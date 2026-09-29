import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../../../../examples/builders/index.ts";
import type { Project } from "../../src/format/schema.ts";
import { parseProject } from "../../src/format/parse.ts";
import { createOptimizerHost, type OptimizerResponse } from "../../src/optimize/worker.ts";

function shelf(): Project {
  const result = parseProject(EXAMPLES["living-room-shelf"]!());
  if (!result.ok) throw new Error("shelf");
  return result.project;
}

function host() {
  const sent: OptimizerResponse[] = [];
  const queue: (() => void)[] = [];
  const handle = createOptimizerHost((m) => sent.push(m), (run) => queue.push(run));
  const drain = (limit = 1000) => {
    for (let i = 0; i < limit && queue.length > 0; i++) queue.shift()!();
  };
  return { sent, queue, handle, drain };
}

describe("createOptimizerHost", () => {
  it("sends progress after each slice and done at the end", () => {
    const { sent, handle, drain } = host();
    handle({ type: "start", id: 1, project: shelf(), options: { iterations: 4 }, progressMs: 0 });
    drain();
    const last = sent.at(-1)!;
    expect(last).toMatchObject({ type: "done", id: 1, cancelled: false, result: { iterations: 8 } });
    expect(sent.slice(0, -1).every((m) => m.type === "progress" && m.id === 1)).toBe(true);
    expect(sent.length).toBeGreaterThan(1);
  });

  it("stops on cancel and sends the best result so far", () => {
    const { sent, queue, handle } = host();
    handle({ type: "start", id: 2, project: shelf(), options: { iterations: 1000 }, progressMs: 0 });
    queue.shift()!();
    handle({ type: "cancel", id: 2 });
    expect(sent.at(-1)).toMatchObject({ type: "done", id: 2, cancelled: true });
    const count = sent.length;
    while (queue.length > 0) queue.shift()!();
    expect(sent).toHaveLength(count);
  });

  it("sends a result that accounts for every copy when cancelled before the first slice", () => {
    const { sent, handle } = host();
    const project = shelf();
    handle({ type: "start", id: 6, project, options: { iterations: 1000 }, progressMs: 0 });
    handle({ type: "cancel", id: 6 });
    const done = sent.at(-1)!;
    expect(done).toMatchObject({ type: "done", id: 6, cancelled: true });
    if (done.type !== "done") return;
    const placed = done.result.sheets.flatMap((s) => s.placements).length;
    expect(placed + done.result.unplaced.length).toBe(project.parts.reduce((n, p) => n + p.quantity, 0));
  });

  it("cancels the running job when a new one starts", () => {
    const { sent, handle, drain } = host();
    handle({ type: "start", id: 3, project: shelf(), options: { iterations: 1000 }, progressMs: 0 });
    handle({ type: "start", id: 4, project: shelf(), options: { iterations: 1 }, progressMs: 0 });
    drain();
    expect(sent[0]).toMatchObject({ type: "done", id: 3, cancelled: true });
    expect(sent.at(-1)).toMatchObject({ type: "done", id: 4, cancelled: false });
    expect(sent.filter((m) => m.id === 3)).toHaveLength(1);
  });

  it("reports an error for a project it cannot read", () => {
    const { sent, handle, drain } = host();
    handle({ type: "start", id: 5, project: {} as Project });
    drain();
    expect(sent).toEqual([{ type: "error", id: 5, message: expect.any(String) }]);
  });
});
