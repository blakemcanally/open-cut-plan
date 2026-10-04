# Web app

The web app in `apps/web` is a React single-page app built with Vite. It runs in the browser only: projects stay on
the user's machine, in the browser's storage and in `.cutplan.json` files.

```bash
npm run dev        # start a development server
npm run build      # write a static build to apps/web/dist
npm run preview    # serve the static build at http://localhost:4173
npm run e2e        # build, start a preview server, and run the Playwright tests
```

The build uses relative paths and hash routes, so `apps/web/dist` works from any static host or folder, such as
GitHub Pages at `https://<owner>.github.io/<repo>/`. CI publishes it to GitHub Pages on each push to `main`.

## Home

- **New project** asks for a name and units (inches or millimetres). A new project has one table saw with the default
  kerf (1/8" or 3 mm) and no parts or stock. It uses the factory edges of each sheet, so it has no trim.
- **Open a .cutplan.json file** reads a project file. Browsers with the File System Access API remember the file, so
  **Save file** writes back to it. Other browsers upload the file and download it again on save.
- **Open example** opens one of the projects in `examples/`.
- **Projects in this browser** lists the saved projects, newest change first. **Delete** asks first and removes the
  project from the browser only; saved files are not changed.

A file that does not pass the format checks is not opened, and the home screen shows the reasons. A file with warnings
(for example, a newer minor version) opens, and the workspace shows the warnings until the user dismisses them.

## Workspace

The header has the project name, **Undo** and **Redo**, **Save file**, and **Save as…**. The address
is `#/project/<id>`, so a reload opens the same project.

- **Undo and redo** keep the last 100 edits. Arrow-key moves of one part less than one second apart count as one
  edit. The keys are ⌘Z / Ctrl+Z, and ⇧⌘Z / Ctrl+Y for redo. The keys do not act while the focus is in a text field,
  so the field's own undo works there. The keys also do not act while a dialog is open.
- **Autosave** writes the project to IndexedDB half a second after each change, and at once when the page is hidden.
  When the browser cannot save (for example, private mode or a full disk), a banner stays open and asks the user to
  use **Save file**.
- **Save file** writes the project with its computed cut sequence (`plan.cuts`), so other tools can read the cuts.

The tabs are **Design**, **Parts**, **Stock**, **Tools**, **Layout**, **Shop**, **Reports**, and **Settings**. The
left and right arrow keys move between tabs.

### Design

A design describes a cabinet unit: a KALLAX-style or EKET-style grid of cells, or a custom grid. The app makes its
parts from the design, and the Parts tab lists them. The file format is in [format.md](format.md#designs-added-in-11).

- **Add design** adds a KALLAX 2x2 of the first material that is thick enough for pocket screws. With no materials, it
  adds Plywood (3/4" or 18 mm) first.
- The new design has a back of the first material that is too thin for pocket screws. With no such material, the app
  adds Plywood 1/4" (or Plywood 6 mm) and one sheet stock of it, with the size of the first sheet of the design material
  and no cost. Choose "No back" to remove the back.
- The list on the left selects a design. The form has the name, the system, how many to build, the columns and rows,
  the depth, the material, the back, and the mount.
- The **Material** and **Back** lists also show the [catalogue](catalog.md) materials that the project does not have,
  in groups by family. A catalogue material adds the material, and its largest sheet size as stock when the project
  has no sheet of it. When the design refuses the material, the app adds nothing.
- A KALLAX or EKET width or height takes its size from the cells. A custom axis is sized by the outside size, or by
  the list of openings (`335, 335`). Changing the count of a custom axis sized by openings repeats the last opening.
- Changing the system to KALLAX or EKET applies its cell sizes and depth. Changing it to Custom keeps the sizes.
- The front view updates while the user types. Enter or leaving the field applies the value; Escape goes back.
- A value that makes the design impossible (for example, a material too thin for pocket screws) is not applied. The
  field stays marked and a message gives the reason. It adds no undo step.
- Each change makes the design's parts again. The copies of those parts leave the sheets when their size changes, and
  stay when it does not. One **Undo** restores the design, its parts, and the sheets.
- **Colours in the layout** has a colour box for each unit. With "How many to build" at 2 or more, each unit has its
  own automatic colour, for example "Hall KALLAX 1 of 2" and "Hall KALLAX 2 of 2". Choose a colour in the box to change
  it. **Automatic** gives the unit its automatic colour again. The front view uses the colour of the first unit.
  These controls also work for a design that the user cannot change.
- **Checks** lists the problems and warnings for the design, for example a cell that is too wide for a shelf.
- **Detach** turns the parts into normal parts and removes the design. **Delete design** removes the design and its
  parts. **Undo** brings back either one.
- A file from a newer version, or with a system that this app does not know, shows the design but does not let the
  user change it. **Detach** and **Delete design** still work.

### Parts

An editable table: name, length, width, quantity, material, grain, factory edge, group, and notes. Lengths accept fractions and
feet (`2' 3 1/2`), decimals, and millimetres. A field keeps text it cannot read, marks it, and restores the last good
value when the focus leaves; Escape restores it at once.

- **Add part** adds a part and puts the focus in its name.
- Pasting rows from a spreadsheet anywhere on the tab opens the import dialog. **Paste rows…** and **Import CSV…** open
  the same dialog. The dialog guesses the columns from the header; when it cannot, the user picks them. Rows with
  errors are listed and left out. The dialog names the materials that are new; **Import** adds them.
- Lowering a quantity takes the extra copies off the sheets. Deleting a part removes its copies from the plan.
- The totals give the number of pieces and the area for each material.
- **Factory edge** asks for a long edge of the part on a factory edge of the sheet. **By the rule** follows the
  rule in Settings → Factory edges, and the choice says what the rule gives, for example "By the rule: long edge".
  **Long edge** asks for a factory edge, and **None** does not. A value that this app does not know shows with
  "(not known)" and stays in the file. A part that a design makes always follows the rule.
- A part that a design makes cannot be changed on this tab. Its row says **From design:** with a link to the design.
- **Group colours in the layout** has a colour box for each group of parts without a design. Choose a colour to
  change it. **Automatic** gives the group its automatic colour again. The colours of the design units are on the
  Design tab.

### Stock

A materials table (name, thickness, grain, colour) and a stock table (name, material, size, quantity or unlimited,
cost, kind, edges, and whether to use it). Stock also has a CSV import. **Edges** is the project choice, **Use factory
edges**, or **Trim** with a width for that stock. A material that parts, stock, or designs use cannot
be deleted. Deleting stock also removes its sheets from the plan.

**Add from catalogue…** opens the [catalogue of sheet goods](catalog.md).

- Choose a family, then a material. The dialog shows the actual thickness, the nominal thickness, and the notes.
- Choose one or more sheet sizes. Each size shows its actual size and its typical price, with the store and the date of
  the price. A size with no price says "No price found." A size that the project has says "In the project", and you
  cannot choose it.
- **Add** adds the material when the project does not have it, and adds each size as unlimited sheet stock. The cost
  is the typical price when the project currency is USD. In other currencies, the stock has no cost.
- The prices are typical and dated. Check the price before you buy.

### Tools

The tools in the order the cut analysis tries them. Each tool has a name, a kerf, the limits for its type, and an
**Enabled** switch. **Up** and **Down** change the order. A new project starts with a table saw and a track saw,
with limits that send the breakdown of full sheets to the track saw. **Add tool** gives a new table saw or track saw
the same limits.

**Tool profiles** keep a set of tools in the browser for use in other projects. A profile stores its units; using a
millimetre profile in an inch project converts the kerf and limits.

### Layout

Sheets are drawn to scale. Parts have their colour, grain stripes, and a ⟂ mark when they lie across the grain. Each
unit of a design has its own colour, and each group of parts without a design has one colour. A part without a design
or a group is grey. The **Colours** list beside the sheets names each colour, for example "Hall KALLAX 2 of 2". The
user chooses the colours on the Design tab and the Parts tab. The Shop tab, the Reports tab, the printed booklet, and
the SVG files use the same colours. See [format.md](format.md#colours-added-in-14). The trim zone is dashed. Cut lines are numbered in sequence order. A part with a problem
turns red and has a ⚠ mark; the **Problems** list names each problem, and **Show** selects the part. A part that asks
for a factory edge has a thick black line on each long edge that is on a factory edge. The Shop tab, the printed
booklet, and the SVG files show the same lines. The Problems list names each
part that asks for a factory edge and does not get one.

- Under the title of each sheet, the app shows the full stock name. The name wraps, so it is never cut off.
- Under the stock name, a summary line gives the cuts of each tool, the part of the sheet that parts use, and the
  cost of the sheet, for example "Track saw 3 cuts · Table saw 9 cuts · 72% used · $65.00". The tools are in profile
  order, and "No tool" is last. The cost shows when the `cost` feature is on and the stock has a price. An owned
  offcut has no cost.
- **Cut lines** beside the sheets has the **Colour cuts by** choice: **Stage** (the default) or **Tool**, and a
  legend for the choice. With **Stage**, each stage has its colour. With **Tool**, each enabled tool has one colour,
  in profile order. A cut with no tool, or with a chosen tool that is over one of its limits, is red, and its number
  has a light red fill. The legend then has the item "No tool, or over a tool limit". The choice belongs to the
  browser, not to the project file. **Cut lines** shows only when the sheets show cut lines.
- A click on a cut number opens its step on the Shop tab. Tab moves the focus to the cut numbers after the parts of
  the sheet; Enter or Space opens the step. Each cut number has a name such as "Step 5, Table saw rip". The name of
  a cut with a problem adds "no tool" or the limit, for example "Step 1, Table saw trim, over its largest piece".
  While the focus is on a cut number, the part keys (**R**, **Delete**, and the arrow keys) do not act.

- **Optimize** plans every part again. Pinned sheets stay as they are.
- **Optimize the rest** keeps every sheet and plans only the parts in the tray.
- **Keep searching** continues the last search from its best plan. It is offered while the project is still the one
  the last search produced.
- **Stop** ends a search and uses the best plan so far.
- A line under the buttons names the optimizer goal, for example "Goal: best offcuts, up to 10 % extra cost.", and
  **Change** opens the Optimizer section of the Settings tab. After a search, the line names each material whose plan
  costs more than the cheapest plan found, for example "Plywood: 4 % more cost than the cheapest plan found." When
  the optimizer keeps each unit and group together, the line also tells which units and groups are on more than one
  sheet, for example "KALLAX 1 of 2 is on 2 sheets.", or "Each unit is on one sheet."
- The optimizer runs in a Web Worker, so the page stays responsive. A progress bar shows the part of the time limit
  that is used. When the project changes during a search, the result is not used.
- **Pin** on a sheet keeps it through **Optimize**. **Remove** puts its parts in the tray.
- **Push to factory edges** on a sheet moves its pieces so that more parts that ask for a factory edge get one. It
  uses the same push as the optimizer: the cuts stay the same, and no part turns. The button shows only when the push
  gives one or more parts a factory edge.
- **Add sheet** adds a sheet of the chosen stock. **Remove empty sheets** removes sheets with no parts.
- **−**, **+**, and **Fit** change the zoom. At 100 % (**Fit**), all the sheets fit in the width of the column and
  the height of the window, in rows. When they cannot all fit, each sheet is at least 200 px long, the rows fill the
  width, and the page scrolls. The zoom percentage is relative to this fit.

Parts move by dragging between sheets and the tray. A drag snaps to sheet edges, the trim line, and one kerf from other
parts. The dragged part moves to the snapped position, and a dashed guide line shows each line that it snapped to. Away
from these lines, the near edges of the part snap to the grid. The grid starts at the corner inside the trim, and the
sheets show it as faint lines. The sheets do not show the grid when its lines would be less than 6 pixels apart, or
when snapping is off. Hold Alt (⌥) to drag without snapping. The keyboard does the same work: Tab or a click selects a
part, **R** turns it, **Delete** sends it to the tray, the arrow keys move it by the display precision (with Shift, by
1" or 25 mm), and **Escape** clears the selection. **R**, **Delete**, and the arrow keys act only while the focus is on
a part. The side panel shows the selected part, a **Location** list to move it to a sheet or the tray, and **X** and
**Y** fields for an exact position.

A layout with problems is never blocked: the user can keep editing, and the Problems list updates after each change.

### Shop

The cut sequence as a checklist for use at the saw. It works on a phone: the step and its sheet come first, and the
list follows.

- The current step shows its title, a **Tool** list, the tool and the kind of cut, the piece to pick up, numbered
  actions, and a result for each side of the cut: **Part**, **Next** (with **Go to step N**), **Offcut**, or
  **Waste**. On the drawing, the piece to pick up has an outline and the rest of the sheet is pale; the current cut
  is thick and filled, and the cuts that are done are grey.
- **Tool** changes the tool of the current cut. The recommended tool has "(recommended)"; a tool that is over one of
  its limits for the cut says which limit, and the first action warns about it. The file keeps the choice. The ticks
  stay on their cuts.
- A colour box beside **Tool** shows the colour of the tool, as on the Layout tab. The box is red when the cut has
  no tool, or when the tool is over one of its limits.
- The list shows each step as its number and what it does. When all the steps of a sheet use one tool, the sheet
  heading names the tool; otherwise each step names its tool. Each tool name has the colour box of the tool.
- The drawing colours the cuts as the **Colour cuts by** choice on the Layout tab does.
- A cut number on the Layout tab opens the Shop tab at its step, and puts the focus on the step title. A later
  visit to the Shop tab starts at the first step that is not done again.
- **Mark done** ticks the current step and goes to the next step that is not done. **← Previous** and **Next →** move
  without a tick. The list groups the steps by sheet; a click on a step makes it current, and its box ticks it.
- The ticks are saved in the project (`extensions["opencutplan.app"].progress`), so they stay after a reload and go
  with the file. A tick is an edit, so **Undo** removes it.
- The saved ticks belong to one cut sequence. When an edit changes the sequence, the ticks no longer show, and a
  banner offers **Start over** (clear them) or **Keep my ticks** (use the same step numbers for the new sequence).
  While the banner shows, the app disables the tick boxes and **Mark done**. **← Previous**, **Next →**, and the list
  still move between the steps. Editing is never blocked.
- **Reset progress** clears every tick after a confirmation. After **Reset progress** or **Start over**, the first
  step is current. **Print cut sequence** prints the checklist.
- When the `cutOrder` feature is off, the tab has no steps. It tells the user to turn on **Cut order** in Settings.
- **Assembly** follows the cut steps. It lists the assembly steps of each design, numbered from 1 across all the
  designs. The ticks are saved apart from the cut ticks (`extensions["opencutplan.app"].assemblyProgress`). When a
  design change changes the steps, the same **Start over** and **Keep my ticks** banner shows for the assembly steps
  only. **Reset assembly** clears the assembly ticks after a confirmation. The list shows also when there are no cut
  steps.

### Reports

- **Print and export**: the **Print booklet** group, **Export parts CSV**, **Export stock CSV**, and one **Sheet N as
  SVG** button for each sheet. File names start with the project name: `Shelf-parts.csv`, `Shelf-stock.csv`,
  `Shelf-sheet-1.svg`.
- **Print booklet**: a checkbox for each section of the booklet: **Title page**, **Shopping list**, **Sheet
  diagrams**, **Cut sequence**, and **Assembly steps** (when there are designs). A section with no content has its
  checkbox off and disabled, with a note that says why. **Print booklet** prints the checked sections as one
  document. It needs at least one section other than the title page. The choice is kept in this browser, not in the
  project file. All sections are on at first.
- **Shopping list**: for each material, the stock, its size, the sheets in the plan, the count to buy (owned offcuts
  are not bought), the unit cost, the cost, and a subtotal; then the share of the stock that parts use, and the waste.
  The total follows, or a warning that names the stock with no price. The cost columns are hidden when the `cost`
  feature is off. A second table gives the use of each sheet. When the plan has cut steps, a line gives their count
  and the total cut length.
- **Hardware** (when there are designs): the screws, rails, legs, and glue to buy, with the IKEA article number and the
  design that needs each item. The article numbers are for IKEA in Great Britain.
- **Front views**: the drawing of each design, and a **<name> as SVG** button that downloads `Shelf-<design id>.svg`.
- **Offcuts** (when the `offcuts` feature is on) lists the waste pieces that are at least the smallest useful offcut.
  **Save offcuts to stock** adds them to the Stock tab as owned offcuts. It adds each offcut once: an offcut that is
  already in stock from the same sheet number, with the same material and size (to within 1/64" or 0.1 mm), is not
  added again. This also holds after a unit change or a project rename.
- **Labels** (when the `labels` feature is on): pick the label sheet and the first free label on it, then **Print
  labels**. Each label has the part name, size, material, group (with the unit of a design that has more than one,
  for example "Hall KALLAX 2 of 2"), grain arrow (↔ along the length, ↕ along the width), "Factory edge" when
  the part asks for one, and the sheet and step that cut it, or "Not placed".

With no plan, the tab says so. It keeps the CSV exports and the labels, and each label says "Not placed".

### Printing

**Print booklet**, **Print labels**, and **Print cut sequence** on the Shop tab open the browser's print dialog with
only that output; the app is hidden on paper. Use the dialog's "Save as PDF" for a PDF.

The booklet has its sections in the order of the list below, and each section starts on a new page. The sheet
diagrams are landscape pages; the other pages are portrait. **Print cut sequence** on the Shop tab prints a booklet
with only the cut sequence.

- **Title page**: the project name, the date, and a list of the other sections in the booklet.
- **Shopping list**: the tables from the Reports tab, with the hardware.
- **Sheet diagrams**: one landscape page per sheet with the sheet number, the stock, and the scale. The drawing uses
  the largest of 1:1, 1:2, 1:4, 1:5, 1:8, 1:10, 1:12, 1:16, 1:20, 1:25, and 1:50 that fits; the page says "Scale
  1:12", or "Not to scale" when none fits. The key lists the parts with their sizes and grain, and explains the cut
  numbers and stage colours. The key has one row for each part and orientation on the sheet, in the order of the
  parts list. A row for more than one copy shows the part name and the count, for example "Side ×4". The key goes
  beside the drawing when that gives a larger scale.
- **Cut sequence**: portrait pages with a small drawing of each sheet and a box to tick for each step.
- **Assembly steps**: one page for each design, with its front view and a box to tick for each step.

**Print labels** prints the labels alone, on the page size of the label sheet with no margins. Print at 100% ("Actual
size"), not "Fit to page".

### Settings

The Settings tab has a list of its sections at the side. A click on a section shows that section only. The list marks
the section that shows. The tab opens on the first section. After a visit to another tab, the tab shows the last
section again. On a narrow window, the list is above the settings.

The search box is above the list. When the box has text, the tab shows each setting whose name contains the text,
from all sections, under the name of its section. The search ignores case. When the text is in the name of a section,
the tab shows all of that section. When no setting matches, the tab says so. An empty search box, or a click on a
section, shows the section from the list again.

The sections put the common settings first:

- **Units and precision**. Changing units converts every length in the project and removes the stored cut sequence.
- **Factory edges**: **Use the factory edges** (no trim) or **Trim each edge** with a trim width. A stock item on the
  Stock tab can make its own choice. **Put long parts on a factory edge** turns on the rule
  `settings.factoryEdge`, with a **Shortest long part** of 36" or 900 mm. Each part with a long side of at least
  that length then asks for a factory edge. The rule can change only while the plan uses the factory edges.
- **Snapping**: the snapping switch and the grid size. A grid of 0 turns the grid off. The default grid is 1" or
  25 mm.
- **Plan**: the cut order and the smallest useful offcut.
- **Optimizer**: the **Goal** ("Lowest cost", "Best offcuts", or "Fewest cuts"), **Extra cost allowed (%)** (0 to
  100; off for "Lowest cost"), **Keep each unit and group together** (on by default), the search time (up to 3600
  seconds), and the seed. A goal from a newer version of the app shows as "<value> (unknown)", and the optimizer uses
  the lowest cost. When the Offcuts feature is off, a note says that "Best offcuts" gives the same plan as "Lowest
  cost". **Keep each unit and group together** puts the parts of each design unit and each part group (one colour
  in the layout) on as few sheets as possible. It never makes the plan cost more. See
  [`optimizer.md`](optimizer.md#objective).
- **Money**: the currency.
- **View**: **Show cut lines** and **Draw cut lines at kerf width**.
- **Features**: the other feature switches.

The grid and the view choices belong to the browser, not to the project file. While a dialog is open, Tab stays
inside it.

## Tests

`npm test -w @opencutplan/web` runs the component tests with Vitest, jsdom, Testing Library, and fake-indexeddb.
The optimizer tests run the real worker protocol in the test thread.

`npm run e2e` runs the Playwright tests in `apps/web/e2e` in Chromium against a production build. They cover a new
project from CSV through optimize, the Shop checklist across a reload and at a phone width, printing the booklet
(with a PDF that has landscape sheet pages), and the SVG and CSV downloads; drag, rotate, and undo in the layout
editor; and a design through optimize, the assembly checklist across a reload, and the assembly print. Install the
browser once with `npm run e2e:install`. `npm run check` does not run them; CI runs both
(`.github/workflows/ci.yml`).
