import { errorMessage, type Project } from "@opencutplan/core";
import { useEffect, useState } from "react";
import type { WorkerFactory } from "./optimizer/useOptimizer.ts";
import { Home, type OpenRequest } from "./screens/Home.tsx";
import { Workspace } from "./screens/Workspace.tsx";
import type { Storage } from "./storage/db.ts";

const PROJECT_ROUTE = /^#\/project\/(.+)$/;

function routeId(): string | null {
  const match = PROJECT_ROUTE.exec(window.location.hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

interface Opened extends OpenRequest {
  id: string;
  stored?: boolean;
}

interface AppProps {
  storage: Storage;
  workerFactory: WorkerFactory;
  newId?: () => string;
}

export function App({ storage, workerFactory, newId = () => crypto.randomUUID() }: AppProps) {
  const [id, setId] = useState(routeId);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  if (opened !== null && opened.id !== id) setOpened(null);

  useEffect(() => {
    const onHash = () => setId(routeId());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (id === null || opened?.id === id) return;
    let live = true;
    setLoadError(null);
    storage.loadProject(id).then(
      (project: Project | null) => {
        if (!live) return;
        if (project) setOpened({ id, project, notices: [], stored: true });
        else setLoadError("This project is not saved in this browser.");
      },
      (e: unknown) => live && setLoadError(errorMessage(e)),
    );
    return () => {
      live = false;
    };
  }, [id, opened, storage]);

  const go = (next: string | null) => {
    window.location.hash = next === null ? "#/" : `#/project/${encodeURIComponent(next)}`;
    setId(next);
  };

  if (id === null) {
    return (
      <Home
        storage={storage}
        onOpen={go}
        onCreate={(request) => {
          const created = newId();
          setOpened({ ...request, id: created });
          go(created);
        }}
      />
    );
  }
  if (loadError) {
    return (
      <main className="home">
        <p role="alert" className="banner error">
          ✖ {loadError}
        </p>
        <button type="button" onClick={() => go(null)}>
          ← Projects
        </button>
      </main>
    );
  }
  if (opened?.id !== id) return <p className="muted">Loading…</p>;
  return (
    <Workspace
      key={opened.id}
      id={opened.id}
      initial={opened.project}
      notices={opened.notices}
      handle={opened.handle}
      stored={opened.stored === true}
      storage={storage}
      workerFactory={workerFactory}
      onHome={() => go(null)}
    />
  );
}
