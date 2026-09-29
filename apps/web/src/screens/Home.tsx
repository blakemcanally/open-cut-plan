import { createProject, newTool, parseProject, type Project, type Units } from "@opencutplan/core";
import { useEffect, useState } from "react";
import { EXAMPLES } from "../examples.ts";
import type { ProjectSummary, Storage } from "../storage/db.ts";
import { openProjectFile } from "../storage/files.ts";

export interface OpenRequest {
  project: Project;
  notices: string[];
  handle?: FileSystemFileHandle;
}

interface HomeProps {
  storage: Storage;
  onOpen(id: string): void;
  onCreate(request: OpenRequest): void;
}

/** A new project starts with one table saw so the plan can be cut at once. */
export function newProject(name: string, units: Units): Project {
  const project = createProject(name, units);
  return { ...project, tools: [newTool("table-saw", units, new Set())] };
}

export function Home({ storage, onOpen, onCreate }: HomeProps) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState<Units>("in");
  const [example, setExample] = useState(EXAMPLES[0]!.slug);

  const refresh = () =>
    storage.listProjects().then(setProjects, (e: unknown) => {
      setProjects([]);
      setError(`Saved projects could not be read: ${(e as Error).message}`);
    });
  useEffect(() => {
    void refresh();
  }, [storage]);

  const openText = (text: string, handle?: FileSystemFileHandle) => {
    const result = parseProject(text);
    if (!result.ok) {
      setError(`The file could not be opened. ${result.errors.map((issue) => issue.message).join(" ")}`);
      return;
    }
    onCreate({ project: result.project, notices: result.warnings.map((issue) => issue.message), ...(handle ? { handle } : {}) });
  };

  return (
    <main className="home">
      <h1>OpenCutPlan</h1>
      <p className="muted">Plan sheet-goods cuts: parts, stock, tools, an optimizer, and a layout you can edit.</p>
      {error && (
        <p role="alert" className="banner error">
          ✖ {error}
        </p>
      )}
      <div className="home-actions">
        <form
          className="card"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate({ project: newProject(name.trim() || "Untitled project", units), notices: [] });
          }}
        >
          <h2>New project</h2>
          <label className="stack">
            Name
            <input type="text" value={name} placeholder="Untitled project" onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="stack">
            Units
            <select value={units} onChange={(event) => setUnits(event.target.value as Units)}>
              <option value="in">Inches</option>
              <option value="mm">Millimetres</option>
            </select>
          </label>
          <button type="submit" className="primary">
            Create project
          </button>
        </form>
        <div className="card">
          <h2>Open</h2>
          <button
            type="button"
            onClick={async () => {
              setError(null);
              try {
                const file = await openProjectFile();
                if (file) openText(file.text, file.handle);
              } catch (e) {
                setError(`The file could not be read: ${(e as Error).message}`);
              }
            }}
          >
            Open a .cutplan.json file…
          </button>
          <label className="stack">
            Example
            <select value={example} onChange={(event) => setExample(event.target.value)}>
              {EXAMPLES.map((e) => (
                <option key={e.slug} value={e.slug}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => openText(EXAMPLES.find((e) => e.slug === example)!.text)}>
            Open example
          </button>
        </div>
      </div>
      <section aria-labelledby="saved-title">
        <h2 id="saved-title">Projects in this browser</h2>
        {projects === null && <p className="muted">Loading…</p>}
        {projects?.length === 0 && <p className="muted">No saved projects yet.</p>}
        {projects && projects.length > 0 && (
          <table className="grid">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Units</th>
                <th scope="col">Pieces</th>
                <th scope="col">Changed</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <button type="button" className="link" onClick={() => onOpen(project.id)}>
                      {project.name}
                    </button>
                  </td>
                  <td>{project.units}</td>
                  <td>{project.parts}</td>
                  <td>{new Date(project.modified).toLocaleString()}</td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Delete ${project.name}`}
                      onClick={async () => {
                        if (!window.confirm(`Delete “${project.name}” from this browser? Files you saved are not changed.`)) return;
                        await storage.deleteProject(project.id);
                        await refresh();
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
