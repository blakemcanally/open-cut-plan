import { parseProject, serializeProjectChecked, type Project, type Tool, type Units } from "@opencutplan/core";

const DB_NAME = "opencutplan";
const DB_VERSION = 1;
const PROJECTS = "projects";
const PROFILES = "toolProfiles";

interface ProjectRecord {
  id: string;
  name: string;
  units: Units;
  parts: number;
  modified: string;
  data: string;
}

export type ProjectSummary = Omit<ProjectRecord, "data">;

export interface ToolProfile {
  name: string;
  units: Units;
  tools: Tool[];
}

export interface Storage {
  /** Newest first. */
  listProjects(): Promise<ProjectSummary[]>;
  /** Null when no project has this id. Throws when the stored file no longer parses. */
  loadProject(id: string): Promise<Project | null>;
  saveProject(id: string, project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
  /** Sorted by name. */
  listProfiles(): Promise<ToolProfile[]>;
  saveProfile(profile: ToolProfile): Promise<void>;
  deleteProfile(name: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("The browser database request failed."));
  });
}

export function openStorage(factory: IDBFactory = indexedDB, now: () => Date = () => new Date()): Promise<Storage> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(PROFILES)) db.createObjectStore(PROFILES, { keyPath: "name" });
    };
    open.onerror = () => reject(open.error ?? new Error("The browser database could not be opened."));
    open.onsuccess = () => resolve(databaseStorage(open.result, now));
  });
}

function databaseStorage(db: IDBDatabase, now: () => Date): Storage {
  const read = (store: string) => db.transaction(store, "readonly").objectStore(store);
  const write = (store: string, run: (objects: IDBObjectStore) => void) =>
    new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(store, "readwrite");
      run(transaction.objectStore(store));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The browser could not save."));
      transaction.onabort = () => reject(transaction.error ?? new Error("The browser stopped the save."));
    });

  return {
    async listProjects() {
      const records = await request(read(PROJECTS).getAll() as IDBRequest<ProjectRecord[]>);
      return records
        .map(({ data: _data, ...summary }) => summary)
        .sort((a, b) => b.modified.localeCompare(a.modified));
    },
    async loadProject(id) {
      const record = await request(read(PROJECTS).get(id) as IDBRequest<ProjectRecord | undefined>);
      if (!record) return null;
      const result = parseProject(record.data);
      if (!result.ok) throw new Error(`The saved project "${record.name}" is damaged: ${result.errors[0]?.message ?? "unknown error"}`);
      return result.project;
    },
    async saveProject(id, project) {
      const record: ProjectRecord = {
        id,
        name: project.project.name,
        units: project.project.units,
        parts: project.parts.reduce((sum, part) => sum + part.quantity, 0),
        modified: now().toISOString(),
        data: serializeProjectChecked(project),
      };
      await write(PROJECTS, (store) => store.put(record));
    },
    deleteProject(id) {
      return write(PROJECTS, (store) => store.delete(id));
    },
    async listProfiles() {
      const profiles = await request(read(PROFILES).getAll() as IDBRequest<ToolProfile[]>);
      return profiles.sort((a, b) => a.name.localeCompare(b.name));
    },
    saveProfile(profile) {
      return write(PROFILES, (store) => store.put(profile));
    },
    deleteProfile(name) {
      return write(PROFILES, (store) => store.delete(name));
    },
  };
}

/** Used when the browser has no database (for example, some private windows): nothing is kept, and every save fails with `reason`. */
export function unavailableStorage(reason: string): Storage {
  const fail = () => Promise.reject(new Error(reason));
  return {
    listProjects: () => Promise.resolve([]),
    loadProject: () => Promise.resolve(null),
    saveProject: fail,
    deleteProject: () => Promise.resolve(),
    listProfiles: () => Promise.resolve([]),
    saveProfile: fail,
    deleteProfile: () => Promise.resolve(),
  };
}
