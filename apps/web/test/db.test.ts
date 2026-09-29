import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { openStorage, unavailableStorage } from "../src/storage/db.ts";
import { sampleProject } from "./helpers.ts";

const clock = () => {
  let t = Date.UTC(2026, 8, 28, 12);
  return () => new Date((t += 1000));
};

describe("browser storage", () => {
  it("saves, lists newest first, loads, and deletes projects", async () => {
    const storage = await openStorage(new IDBFactory(), clock());
    const project = sampleProject();
    await storage.saveProject("a", project);
    await storage.saveProject("b", { ...project, project: { ...project.project, name: "Second" } });
    const list = await storage.listProjects();
    expect(list.map((p) => [p.id, p.name, p.units, p.parts])).toEqual([
      ["b", "Second", "in", 3],
      ["a", "Test", "in", 3],
    ]);
    expect(await storage.loadProject("a")).toEqual(project);
    expect(await storage.loadProject("missing")).toBeNull();
    await storage.deleteProject("a");
    expect((await storage.listProjects()).map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps tool profiles by name", async () => {
    const storage = await openStorage(new IDBFactory());
    const tools = sampleProject().tools;
    await storage.saveProfile({ name: "Shop", units: "in", tools });
    await storage.saveProfile({ name: "Garage", units: "mm", tools: [] });
    expect((await storage.listProfiles()).map((p) => p.name)).toEqual(["Garage", "Shop"]);
    await storage.deleteProfile("Shop");
    expect(await storage.listProfiles()).toEqual([{ name: "Garage", units: "mm", tools: [] }]);
  });

  it("fails every save when the browser has no storage", async () => {
    const storage = unavailableStorage("no database");
    expect(await storage.listProjects()).toEqual([]);
    await expect(storage.saveProject("a", sampleProject())).rejects.toThrow("no database");
  });
});
