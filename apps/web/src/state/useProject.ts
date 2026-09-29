import type { Project } from "@opencutplan/core";
import { useCallback, useMemo, useReducer } from "react";
import { createHistory, record, redo, undo, type History } from "./history.ts";

export type ProjectEdit = Project | ((project: Project) => Project);

type Action =
  | { type: "edit"; edit: ProjectEdit; key: string | undefined; at: number }
  | { type: "undo" }
  | { type: "redo" };

function reducer(history: History<Project>, action: Action): History<Project> {
  switch (action.type) {
    case "edit": {
      const next = typeof action.edit === "function" ? action.edit(history.present) : action.edit;
      return record(history, next, action.key, action.at);
    }
    case "undo":
      return undo(history);
    case "redo":
      return redo(history);
  }
}

export interface ProjectStore {
  project: Project;
  /** Records one undo step; edits with the same `key` in quick succession merge into one step. */
  edit(edit: ProjectEdit, key?: string): void;
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useProject(initial: Project): ProjectStore {
  const [history, dispatch] = useReducer(reducer, initial, createHistory);
  const edit = useCallback((change: ProjectEdit, key?: string) => dispatch({ type: "edit", edit: change, key, at: Date.now() }), []);
  const undoEdit = useCallback(() => dispatch({ type: "undo" }), []);
  const redoEdit = useCallback(() => dispatch({ type: "redo" }), []);
  return useMemo(
    () => ({
      project: history.present,
      edit,
      undo: undoEdit,
      redo: redoEdit,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
    }),
    [history, edit, undoEdit, redoEdit],
  );
}
