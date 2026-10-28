import { analyzeProject } from "@opencutplan/core";
import { act, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMemo } from "react";
import { describe, expect, it } from "vitest";
import { DesignTab } from "../src/screens/DesignTab.tsx";
import type { ProjectStore } from "../src/state/useProject.ts";
import { designProject } from "./helpers.ts";
import { renderWithStore } from "./render.tsx";

function renderDesign(project = designProject()) {
  return renderWithStore(project, (store) => <Tab store={store} />);
}

function Tab({ store }: { store: ProjectStore }) {
  const analysis = useMemo(() => analyzeProject(store.project), [store.project]);
  return <DesignTab store={store} analysis={analysis} />;
}

const finish = (current: () => ProjectStore) => current().project.designs![0]!.finish;

async function addStep(text: string) {
  await userEvent.click(screen.getByRole("button", { name: "Add a finish step" }));
  await userEvent.keyboard(`${text}{Enter}`);
}

describe("FinishSteps", () => {
  it("adds, changes, moves, and removes finish steps", async () => {
    const { current } = renderDesign();
    expect(finish(current)).toBeUndefined();
    await addStep("Sand lightly.");
    expect(finish(current)).toEqual(["Sand lightly."]);
    await addStep("Oil the wood.");
    expect(finish(current)).toEqual(["Sand lightly.", "Oil the wood."]);
    expect(screen.getByRole("button", { name: "Move finish step 1 up" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Move finish step 2 down" })).toHaveProperty("disabled", true);

    const first = screen.getByLabelText("Finish step 1");
    await userEvent.clear(first);
    await userEvent.type(first, "Sand with 180 grit.");
    await userEvent.tab();
    expect(finish(current)).toEqual(["Sand with 180 grit.", "Oil the wood."]);

    await userEvent.click(screen.getByRole("button", { name: "Move finish step 2 up" }));
    expect(finish(current)).toEqual(["Oil the wood.", "Sand with 180 grit."]);
    expect(screen.getByLabelText("Finish step 1")).toHaveProperty("value", "Oil the wood.");

    await userEvent.click(screen.getByRole("button", { name: "Move finish step 1 down" }));
    expect(finish(current)).toEqual(["Sand with 180 grit.", "Oil the wood."]);

    await userEvent.click(screen.getByRole("button", { name: "Remove finish step 1" }));
    expect(finish(current)).toEqual(["Oil the wood."]);
    await userEvent.click(screen.getByRole("button", { name: "Remove finish step 1" }));
    expect(current().project.designs![0]).not.toHaveProperty("finish");
  });

  it("focuses the new step, and removes a step that is committed empty", async () => {
    const { current } = renderDesign();
    await userEvent.click(screen.getByRole("button", { name: "Add a finish step" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Finish step 1"));
    await userEvent.keyboard("Wax it.{Enter}");
    await userEvent.clear(screen.getByLabelText("Finish step 1"));
    await userEvent.tab();
    expect(current().project.designs![0]).not.toHaveProperty("finish");
    expect(screen.queryByLabelText("Finish step 1")).toBeNull();
  });

  it("does not save an empty step", async () => {
    const { current } = renderDesign();
    const before = current().project;
    await userEvent.click(screen.getByRole("button", { name: "Add a finish step" }));
    fireEvent.blur(screen.getByLabelText("Finish step 1"));
    expect(screen.queryByLabelText("Finish step 1")).toBeNull();
    expect(current().project).toBe(before);
    expect(current().project.designs![0]).not.toHaveProperty("finish");
    await userEvent.click(screen.getByRole("button", { name: "Add a finish step" }));
    await userEvent.keyboard("   {Enter}");
    await userEvent.tab();
    expect(current().project).toBe(before);
  });

  it("follows an undo", async () => {
    const { current } = renderDesign();
    await addStep("Sand lightly.");
    act(() => current().undo());
    expect(screen.queryByLabelText("Finish step 1")).toBeNull();
  });

  it("locks the steps for a file from a newer version", () => {
    const project = designProject();
    renderDesign({ ...project, version: "1.12", designs: [{ ...project.designs![0]!, finish: ["Sand lightly."] }] });
    expect(screen.getByLabelText("Finish step 1").matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Add a finish step" }).matches(":disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Remove finish step 1" }).matches(":disabled")).toBe(true);
  });
});
