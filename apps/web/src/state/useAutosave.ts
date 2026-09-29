import type { Project } from "@opencutplan/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Storage } from "../storage/db.ts";

export const AUTOSAVE_MS = 500;

/**
 * Saves the project to the browser shortly after each change, and at once when the page is hidden or closed. Returns the last save error.
 * When `stored` is true, the first project is already in storage and is not written until the project changes.
 */
export function useAutosave(storage: Storage, id: string, project: Project, stored: boolean, delayMs: number = AUTOSAVE_MS): string | null {
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Project | null>(null);
  const first = useRef(project);
  const changed = useRef(!stored);

  const flush = useCallback(() => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    storage.saveProject(id, next).then(
      () => setError(null),
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [storage, id]);

  useEffect(() => {
    if (!changed.current && project === first.current) return;
    changed.current = true;
    pending.current = project;
    const timer = setTimeout(flush, delayMs);
    return () => clearTimeout(timer);
  }, [project, flush, delayMs]);

  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      flush();
    };
  }, [flush]);

  return error;
}
