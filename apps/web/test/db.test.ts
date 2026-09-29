import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { openStorage, unavailableStorage, type ToolProfile } from "../src/storage/db.ts";
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

  it("leaves out tool profiles that do not have the current shape", async () => {
    const storage = await openStorage(new IDBFactory());
    const tools = sampleProject().tools;
    await storage.saveProfile({ name: "Shop", units: "in", tools });
    for (const profile of [
      { name: "Laser", units: "in", tools: [{ id: "l", name: "Laser", type: "laser", kerf: 0.01, enabled: true }] },
      { name: "Feet", units: "ft", tools },
      { name: "Empty", units: "mm" },
    ]) {
      await storage.saveProfile(profile as unknown as ToolProfile);
    }
    expect(await storage.listProfiles()).toEqual([{ name: "Shop", units: "in", tools }]);
  });

  it("refuses to save a project that would not load again", async () => {
    const storage = await openStorage(new IDBFactory());
    const project = sampleProject();
    const broken = { ...project, parts: project.parts.map((part) => ({ ...part, length: Number.POSITIVE_INFINITY })) };
    await expect(storage.saveProject("a", broken)).rejects.toThrow("The project cannot be saved");
    expect(await storage.listProjects()).toEqual([]);
  });

  it("fails every save when the browser has no storage", async () => {
    const storage = unavailableStorage("no database");
    expect(await storage.listProjects()).toEqual([]);
    await expect(storage.saveProject("a", sampleProject())).rejects.toThrow("no database");
  });
});
