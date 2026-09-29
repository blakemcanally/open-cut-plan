import type { Project } from "@opencutplan/core";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { useProject, type ProjectStore } from "../src/state/useProject.ts";

/** Renders UI that takes a project store; `current()` returns the store from the latest render. */
export function renderWithStore(initial: Project, ui: (store: ProjectStore) => ReactNode) {
  let latest: ProjectStore | null = null;
  function Harness() {
    const store = useProject(initial);
    latest = store;
    return <>{ui(store)}</>;
  }
  const result = render(<Harness />);
  return { ...result, current: () => latest! };
}
