import { describe, expect, it } from "vitest";
import { cli, memoryIo, ROW, rowFile, withExamples } from "./helpers.ts";

const rowIo = () => memoryIo({ [ROW]: rowFile() });
const SHEET = ["--sheet", "1"];

describe("cuts", () => {
  it("lists the cuts of a sheet with the stops of each end", async () => {
    const result = await cli(["cuts", "show", ROW, ...SHEET], rowIo());
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Sheet 1 (s1): 8 cuts, automatic cuts.");
    expect(result.stdout).toContain('+60 1/4" (joins 1, 7 cuts)');
    expect(result.stdout).toContain('-40" (across 40 1/16", 8 cuts)');
    const json = (await cli(["cuts", "show", ROW, ...SHEET, "--json"], rowIo())).json();
    expect(json.cuts).toBe("automatic");
    expect(json.steps).toHaveLength(8);
    expect(json.steps[5]).toMatchObject({ step: 6, kind: "rip", axis: "y", at: 10.0625, from: 20.125, to: 40.125 });
    expect(json.steps[5].stops.to.extend).toEqual([{ end: 60.25, length: 40.125, cuts: 7, joins: 1, noTool: false }]);
  });

  it("extends a cut to a stop and saves the cuts", async () => {
    const io = rowIo();
    const result = await cli(["cuts", "extend", ROW, ...SHEET, "--step", "6", "--end", "to", "--to", "max"], io);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Extended step 6 to 60 1/4", joining 1 cut.');
    expect(result.stdout).toContain("Sheet 1 has 7 cuts and saved cuts.");
    expect(result.file(ROW).plan!.sheets[0]!.savedCuts).toHaveLength(7);
    expect((await cli(["layout", "show", ROW, "--json"], io)).json().sheets[0].cuts).toBe("saved");
    const exact = await cli(["cuts", "extend", ROW, ...SHEET, "--step", "6", "--end", "to", "--to", "60.25", "--json", "--dry-run"], rowIo());
    expect(exact.json()).toMatchObject({ step: 6, end: "to", cut: { axis: "y", at: 10.0625, from: 20.125, to: 60.25 }, cuts: 7 });
  });

  it("fails with no-stop and lists the stops", async () => {
    const result = await cli(["cuts", "extend", ROW, ...SHEET, "--step", "6", "--end", "to", "--to", "50", "--json"], rowIo());
    expect(result.code).toBe(2);
    expect(result.json()).toMatchObject({ ok: false, error: { code: "no-stop", stops: [{ end: 60.25 }] } });
    const none = await cli(["cuts", "extend", ROW, ...SHEET, "--step", "1", "--end", "to", "--to", "next"], rowIo());
    expect(none.code).toBe(2);
    expect(none.stderr).toContain("This end has no stops.");
  });

  it("shortens a cut at the cross cut that then goes through it", async () => {
    const result = await cli(["cuts", "shorten", ROW, ...SHEET, "--step", "1", "--end", "to", "--to", "next", "--json", "--dry-run"], rowIo());
    expect(result.code).toBe(0);
    expect(result.json()).toMatchObject({ step: 1, across: 40.0625, cut: { axis: "x", at: 20.0625, from: 0, to: 40 }, cuts: 8 });
    const text = await cli(["cuts", "shorten", ROW, ...SHEET, "--step", "1", "--end", "to", "--to", "40.0625"], rowIo());
    expect(text.stdout).toContain('Shortened step 1 to 40", at the cut at 40 1/16".');
  });

  it("joins the cuts on a line, and fails with no-join when there are none", async () => {
    const io = rowIo();
    const first = await cli(["cuts", "join", ROW, ...SHEET, "--step", "5", "--json"], io);
    expect(first.json()).toMatchObject({ joins: 1, cut: { axis: "y", at: 40.0625, from: 0, to: 80.375 }, cuts: 7 });
    const steps = (await cli(["cuts", "show", ROW, ...SHEET, "--json"], io)).json().steps as { step: number; at: number; axis: string }[];
    const rail = steps.find((step) => step.axis === "y" && step.at === 10.0625)!;
    const second = await cli(["cuts", "join", ROW, ...SHEET, "--step", String(rail.step)], io);
    expect(second.stdout).toContain("Sheet 1 has 6 cuts and saved cuts.");
    const none = await cli(["cuts", "join", ROW, ...SHEET, "--step", "1", "--json"], rowIo());
    expect(none.json()).toMatchObject({ ok: false, error: { code: "no-join" } });
  });

  it("removes only a cut that the parts do not need", async () => {
    const result = await cli(["cuts", "remove", ROW, ...SHEET, "--step", "1", "--json"], rowIo());
    expect(result.code).toBe(2);
    expect(result.json()).toMatchObject({ ok: false, error: { code: "not-removable" } });
  });

  it("refuses a trim cut and a step that is not on the sheet", async () => {
    const trim = await cli(["cuts", "extend", "shelf.cutplan.json", ...SHEET, "--step", "1", "--end", "to", "--to", "max", "--json"], withExamples());
    expect(trim.json()).toMatchObject({ ok: false, error: { code: "trim" } });
    const missing = await cli(["cuts", "remove", ROW, ...SHEET, "--step", "99", "--json"], rowIo());
    expect(missing.json()).toMatchObject({ ok: false, error: { code: "not-found" } });
  });
});
