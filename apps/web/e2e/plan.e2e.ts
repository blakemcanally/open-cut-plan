import { expect, test, type Page } from "@playwright/test";

const PARTS = `name,length,width,quantity,material,grain
Side,30,12,2,Plywood,length
Shelf,20,10,3,Plywood,none`;

const STOCK = `material,length,width,quantity,cost
Plywood,96,48,unlimited,60`;

declare global {
  interface Window {
    printed?: number;
  }
}

async function optimize(page: Page) {
  await page.getByRole("tab", { name: "Layout" }).click();
  await page.getByRole("button", { name: "Optimize", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("[data-copy-key][role=button]").first()).toBeVisible();
}

async function savedData(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open("opencutplan");
        open.onerror = () => reject(open.error ?? new Error("indexedDB.open failed"));
        open.onsuccess = () => {
          const request = open.result.transaction("projects", "readonly").objectStore("projects").getAll();
          request.onerror = () => reject(request.error ?? new Error("getAll failed"));
          request.onsuccess = () => {
            open.result.close();
            resolve((request.result as { data: string }[]).map((record) => record.data).join("\n"));
          };
        };
      }),
  );
}

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.print = () => {
      window.printed = (window.printed ?? 0) + 1;
    };
  });
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("plans a project from CSV, keeps shop progress, and prints and exports it", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Name").fill("E2E shelf");
  await page.getByRole("button", { name: "Create project" }).click();

  await page.getByRole("tab", { name: "Parts" }).click();
  await page.getByRole("button", { name: "Paste rows…" }).click();
  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(PARTS);
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByRole("tab", { name: "Stock" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import CSV…" }).click();
  await (await chooser).setFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(STOCK) });
  await page.getByRole("button", { name: "Import 1 row" }).click();

  await optimize(page);

  await page.getByRole("tab", { name: "Shop" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Step 1 · /);
  await expect(page.locator(".shop-pickup")).toHaveText(/^Pick up the full sheet 96" × 48" \(sheet 1\)\.$/);
  await expect(page.locator(".shop-actions li").first()).toHaveText(/\.$/);
  await expect(page.locator(".shop-diagram [data-piece]")).toHaveCount(1);
  await page.getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByText(/^1 of \d+ steps done\.$/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(/^Step 2 · /);
  await expect.poll(() => savedData(page)).toContain('"progress"');
  await page.reload();
  await page.getByRole("tab", { name: "Shop" }).click();
  await expect(page.getByRole("checkbox", { name: "Step 1 done" })).toBeChecked();
  const tool = page.getByRole("combobox", { name: "Tool", exact: true });
  const other = (await tool.inputValue()) === "track-saw" ? "table-saw" : "track-saw";
  await tool.selectOption(other);
  await expect(page.locator(".shop-method")).toHaveText(new RegExp(`^${other === "track-saw" ? "Track" : "Table"} saw · `));
  await expect(page.getByRole("checkbox", { name: "Step 1 done" })).toBeChecked();
  await expect.poll(() => savedData(page)).toContain('"toolChoices"');

  await page.setViewportSize({ width: 390, height: 844 });
  const scrollY = await page.evaluate(() => window.scrollY);
  for (const done of [2, 3, 4]) {
    await page.getByRole("button", { name: "Mark done" }).click();
    await expect(page.getByText(new RegExp(`^${done} of \\d+ steps done\\.$`))).toBeVisible();
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByText(/^Total: /)).toBeVisible();
  await page.getByRole("button", { name: "Print booklet" }).click();
  await expect.poll(() => page.evaluate(() => window.printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-root .print-title")).toBeVisible();
  await expect(page.locator(".print-root .print-sheet").getByRole("heading", { name: /^Sheet 1 of \d+: Plywood 96" × 48"$/ })).toBeVisible();
  await expect(page.locator(".print-root").getByRole("heading", { name: /: cut sequence$/ })).toBeVisible();
  await expect(page.locator("#root")).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  expect([...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[0 0 (\d+) (\d+)\]/g)].map((box) => (Number(box[1]) > Number(box[2]) ? "landscape" : "portrait"))).toEqual([
    "portrait",
    "portrait",
    "landscape",
    "portrait",
    "portrait",
  ]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".print-root")).toHaveCount(0);
  await expect(page.locator("#root")).toBeVisible();

  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sheet 1 as SVG" }).click();
  const svg = await svgDownload;
  expect(svg.suggestedFilename()).toBe("E2E shelf-sheet-1.svg");
  expect(await readDownload(svg)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export parts CSV" }).click();
  const csv = await csvDownload;
  expect(csv.suggestedFilename()).toBe("E2E shelf-parts.csv");
  expect(await readDownload(csv)).toMatch(/^\uFEFFname,length,width,quantity,material,grain,group,notes\r?\nSide,30,12,2,Plywood,length,,/);
});

test("edits the layout with the mouse and the keyboard, and undoes the edits", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Name").fill("E2E editor");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("tab", { name: "Parts" }).click();
  await page.getByRole("button", { name: "Paste rows…" }).click();
  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(PARTS);
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await page.getByRole("tab", { name: "Stock" }).click();
  await page.getByRole("button", { name: "Paste rows…" }).click();
  await page.getByLabel("Rows (paste from a spreadsheet, or edit)").fill(STOCK);
  await page.getByRole("button", { name: "Import 1 row" }).click();
  await optimize(page);

  const tray = page.getByRole("region", { name: /Unplaced parts/ });
  const part = page.getByRole("button", { name: /^Side 1,/ });
  const from = (await part.boundingBox())!;
  const to = (await tray.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(tray.getByRole("button", { name: /Side 1/ })).toBeVisible();

  await page.getByRole("button", { name: /^Side 2,/ }).focus();
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /^Side 2,/ })).toHaveAttribute("aria-label", /turned/);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: /^Side 2,/ })).not.toHaveAttribute("aria-label", /turned/);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(tray.getByRole("button", { name: /Side 1/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Side 1,/ })).toBeVisible();

  const sheet = (await page.locator("svg[data-sheet]").first().boundingBox())!;
  const start = (await page.getByRole("button", { name: /^Side 1,/ }).boundingBox())!;
  await page.mouse.move(start.x + 5, start.y + 5);
  await page.mouse.down();
  await page.mouse.move(start.x + 25, start.y + 25, { steps: 4 });
  const inch = sheet.width / 96;
  await page.mouse.move(sheet.x + 65.2 * inch + 5, sheet.y + 30 * inch + 5, { steps: 10 });
  const ghost = (await page.locator(".ghost").boundingBox())!;
  const drop = (await page.locator(".drop-preview").boundingBox())!;
  expect(Math.abs(ghost.x - drop.x)).toBeLessThan(1.5);
  expect(Math.abs(ghost.y - drop.y)).toBeLessThan(1.5);
  const guide = (await page.locator("line.snap-guide").first().boundingBox())!;
  expect(Math.abs(guide.x - (sheet.x + sheet.width))).toBeLessThan(2.5);
  await page.mouse.up();
  await expect(page.getByLabel("X (from the left)")).toHaveValue('66"');
});

test("designs a unit, cuts it, keeps the assembly ticks, and prints its hardware and steps", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Name").fill("E2E kallax");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("tab", { name: "Design" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Add design" }).click();
  await expect(page.getByRole("img", { name: /^Front view of KALLAX 2x2: / })).toBeVisible();
  await page.getByLabel("Rows").fill("3");
  await page.getByLabel("Rows").press("Enter");
  await expect(page.getByRole("img", { name: 'Front view of KALLAX 2x2: 28 5/8" × 42 9/16" × 15 11/32"' })).toBeVisible();
  await page.getByLabel("How many to build").fill("2");
  await page.getByLabel("How many to build").press("Enter");
  await page.getByLabel("Colour of KALLAX 2x2 2 of 2").fill("#123456");
  await expect(page.getByRole("button", { name: "Automatic colour for KALLAX 2x2 2 of 2" })).toBeEnabled();

  await page.getByRole("tab", { name: "Parts" }).click();
  await expect(page.getByRole("row", { name: /^Side/ })).toContainText("From design: KALLAX 2x2");

  await page.getByRole("tab", { name: "Stock" }).click();
  await expect(page.getByLabel("Length of stock plywood-96x48")).toBeVisible();
  await expect(page.getByText(/has no stock\./)).toHaveCount(0);
  await optimize(page);
  await expect(page.getByRole("list", { name: "Colours", exact: true }).getByRole("listitem")).toHaveText(["KALLAX 2x2 1 of 2", "KALLAX 2x2 2 of 2"]);
  await expect(page.locator('[data-copy-key="kallax-2x2-top#1"] rect.fill')).toHaveAttribute("fill", "#123456");

  await page.getByRole("tab", { name: "Shop" }).click();
  const assembly = page.getByRole("region", { name: "Assembly" });
  await assembly.getByRole("checkbox", { name: "Assembly step 1 done" }).check();
  await expect(assembly.getByText(/^1 of \d+ assembly steps done\.$/)).toBeVisible();
  await expect.poll(() => savedData(page)).toContain('"assemblyProgress"');
  await page.reload();
  await page.getByRole("tab", { name: "Shop" }).click();
  await expect(page.getByRole("checkbox", { name: "Assembly step 1 done" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Step 1 done", exact: true })).not.toBeChecked();

  await page.getByRole("tab", { name: "Reports" }).click();
  await expect(page.getByRole("region", { name: "Hardware" }).getByRole("row", { name: /^Pocket screws/ })).toBeVisible();
  await page.getByRole("checkbox", { name: "Sheet diagrams" }).uncheck();
  await page.getByRole("button", { name: "Print booklet" }).click();
  await expect.poll(() => page.evaluate(() => window.printed)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".print-root").getByRole("heading", { name: "E2E kallax: KALLAX 2x2" })).toBeVisible();
  await expect(page.locator(".print-root .print-elevation svg")).toBeVisible();
  await expect(page.locator(".print-root .print-sheet")).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(page.locator(".print-root")).toHaveCount(0);
});

test("combines two cells on the Design tab, and optimizes from the sheet estimate", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Name").fill("E2E cells");
  await page.getByRole("combobox", { name: "Units" }).selectOption("mm");
  await page.getByRole("button", { name: "Create project" }).click();

  await page.getByRole("tab", { name: "Design" }).click();
  await page.getByRole("button", { name: "Add design" }).click();
  const sheets = page.getByRole("region", { name: "Sheets" });
  await expect(sheets.getByRole("listitem").first()).toContainText("The project has no sheet stock of Plywood (18 mm).");
  await sheets.getByRole("button", { name: "Add 2440 mm × 1220 mm sheets" }).click();
  await expect(sheets.getByRole("listitem").first()).toHaveText("About 1 sheet of Plywood (18 mm), 2440 mm × 1220 mm.");

  const cells = page.getByRole("grid", { name: "Cells" });
  await cells.getByRole("gridcell", { name: "Column 1, row 1" }).click();
  await cells.getByRole("gridcell", { name: "Column 2, row 1" }).click({ modifiers: ["Shift"] });
  const front = page.getByRole("img", { name: /^Front view of KALLAX 2x2: / });
  await expect(front.locator("[data-highlight]")).toHaveAttribute("width", "688");
  await page.getByRole("button", { name: "Combine" }).click();
  await expect(cells.getByRole("gridcell")).toHaveCount(3);
  const parts = page.getByRole("region", { name: "Parts" });
  await expect(parts.getByRole("row", { name: /^Shelf, columns 1–2/ })).toContainText("688 mm × 384 mm");
  await expect(parts.getByRole("row", { name: /^Divider, row 2/ })).toContainText("335 mm × 384 mm");
  await expect(front.locator("text", { hasText: "688 mm × 335 mm" })).toHaveCount(1);
  await expect(front.locator("[data-label]")).toHaveText(["Shelf, columns 1–2", "Divider, row 2"]);

  await sheets.getByRole("button", { name: "Optimize now" }).click();
  await expect(page.getByRole("tab", { name: "Layout" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Stop" })).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-copy-key^="kallax-2x2-shelf-cols-1-2#"]').first()).toBeVisible();
});

async function readDownload(download: { createReadStream(): Promise<NodeJS.ReadableStream> }): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
