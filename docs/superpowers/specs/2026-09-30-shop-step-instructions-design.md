# Clear cut instructions on the Shop tab — design spec

Status: draft for review. Date: 2026-09-30.

## 1. Summary

The Shop tab shows each cut step as one dense line. An example from the "Living-room shelf" example:

> **Step 7. Table saw, rip.**
> Piece: sheet 1, panel 59 1/2" × 28 1/2". Fence at 15 3/8". Fence side: A Top, A Shelf 1, next at step 10. Other
> side: offcut 59 1/2" × 13".

This spec replaces that text with a structured step: a title that says what the cut does, a tool line with the meaning
of the kind of cut, the piece to pick up, numbered actions, and a labelled result for each side. The diagram outlines
the piece to pick up. The Shop tab, the printed cut sequence, and `report sequence` in the CLI all use the new form.

The spec also changes the tools. A new project starts with a table saw and a track saw, with limits that send the
breakdown of full sheets to the track saw (section 7). The carpenter can pick the tool for each cut on the Shop tab; the
file stores the choice (section 8).

The user named four problems. Each one has a fix in this spec:

| Problem | Fix |
|---|---|
| The text is one dense paragraph. | Numbered actions and a result list (sections 4.4, 4.5, 5.1). |
| It is hard to see what to do after the cut. | A label for each side: Part, Next, Offcut, or Waste (section 4.5). |
| The words are jargon, and the trim steps look the same. | Plain titles, a meaning for each kind of cut, and the edge of each trim (sections 4.1, 4.2). |
| It is hard to find the piece to pick up. | A pick-up line and an outline of the piece on the diagram (sections 4.3, 5.2). |

## 2. Goals and success criteria

1. A person at the saw can do a step from its actions alone, in order, with no other text.
2. Each side of a cut has one label that says what to do with it.
3. Two trim steps on the same sheet have different titles when they trim different edges.
4. The step list on the Shop tab shows different titles for different cuts.
5. The diagram shows the piece of the current step and its cut line at the same time.
6. In a new project, the track saw makes the cuts on a full 4×8 or 5×5 sheet, and the table saw makes the cuts on the
   pieces that fit its limits.
7. The carpenter can change the tool of any cut on the Shop tab. The step text, the diagram, and the list follow the
   change at once, and the ticks stay on their cuts.

Not goals: a drawing of the piece as it goes on the saw (Approach C, a later change); a change to how the cut analysis
picks the recommended tool (the first enabled tool, in order, that can make the cut); a change to the tools of
existing projects or of the examples.

## 3. Words used in this spec

- **Diagram directions:** the sheet diagram draws the stock length from left to right (x) and the stock width from top
  to bottom (y). "Top", "bottom", "left", and "right" are the edges as the diagram shows them.
- **Released side:** the side of a cut with the lower coordinate: the top side of a cut with `axis: "y"`, the left
  side of a cut with `axis: "x"`. The **remainder** is the other side. (This is how `sequence.ts` builds each step.)
- **Measured side:** `step.side`, the side whose size is set on the fence, the stop, or the marks.
- **Cut length:** `step.to − step.from`, the length of the cut line. The edges of the piece that are parallel to the
  cut have this length.
- **Piece word:** "sheet" when `step.piece` is the full stock rectangle, otherwise "panel".

Sizes use `formatIn` and `formatSize`, as now, so the text follows the units and the precision of the project.

## 4. The step text (core)

`describeStep(ctx, step)` in `packages/core/src/sequence/text.ts` returns this type. The type keeps its name.

```ts
export type StepResultKind = "part" | "next" | "offcut" | "waste";

export interface StepResult {
  kind: StepResultKind;
  /** Where this side is at the saw. Only the measured side of a rip or a crosscut has it. */
  where: string | null;
  /** The size of this side, for example `59 1/2" × 13"`. */
  size: string;
  /** The names of the parts on this side, shortened as `list` does now; empty for an offcut or waste. */
  parts: string[];
  /** The step that cuts this side next, or null. */
  next: number | null;
}

export interface StepText {
  /** `Step 7 · Cut 15 3/8" off the panel` */
  title: string;
  /** `Cut 15 3/8" off the panel`: the title without the step number. */
  headline: string;
  /** `Table saw · rip: a cut along the length of the sheet` */
  method: string;
  /** `the panel 59 1/2" × 28 1/2" from step 6`; the UI writes "Pick up …." around it. */
  pickUp: string;
  actions: string[];
  /** The measured side first. */
  results: StepResult[];
  /** All of the above except the title and the method, as plain sentences. */
  body: string;
}
```

### 4.1 Headline and title

- **Trim:** `Trim <amount> off the <edge> edge`. The amount is the piece size along the axis minus the remainder size
  along the axis, as now. The edge is:
  - `axis: "y"`: "top" when the remainder starts below the top of the piece, otherwise "bottom";
  - `axis: "x"`: "left" when the remainder starts to the right of the left edge of the piece, otherwise "right".
- **Rip or crosscut, measured side released:** `Cut <setting> off the <piece word>`.
- **Rip or crosscut, measured side remainder** (the released side is a sliver narrower than the kerf):
  `Cut the <piece word> to <setting>`.

The title is `Step <n> · <headline>`.

### 4.2 Method

`<tool name> · <kind>: <meaning>`, or `No tool · <kind>: <meaning>` when `step.tool` is null. The meanings are:

- rip: "a cut along the length of the sheet";
- crosscut: "a cut across the length of the sheet";
- trim: "a cut that removes the rough factory edge".

### 4.3 Pick up

- The piece is the full stock rectangle: `the full sheet <size> (sheet <n>)`.
- `step.requires` is a step number: `the panel <size> from step <requires>`.
- Otherwise: `the panel <size> on sheet <n>`.

### 4.4 Actions

The measured edge is the outer edge of the measured side: "top" or "left" for the released side, "bottom" or "right"
for the remainder (by axis). "Away from the marks" is "below", "above", "to the right of", or "to the left of", the
direction from the marks away from the measured side.

| Case | Actions |
|---|---|
| Trim, any tool | 1. `Cut <amount> off the <edge> edge.` |
| Table saw, `axis: "y"` | 1. `Set the fence <setting> from the blade.` 2. `Put a <cut length> edge of the <piece word> against the fence.` 3. `Make the cut.` |
| Table saw, `axis: "x"`, or panel saw | 1. `Set the stop <setting> from the blade.` 2. `Put a <cut length> edge of the <piece word> against the stop.` 3. `Make the cut.` |
| Track saw | 1. `Mark <setting> from the <measured edge> edge, at the two ends of the cut.` 2. `Put the edge of the track on the marks.` 3. `Cut with the blade <away from the marks> the marks.` |
| Circular saw | 1. The track saw action 1. 2. `Clamp a straightedge so that the blade cuts next to the marks.` 3. The track saw action 3. |
| No tool | First `No enabled tool can make this cut. Check the Tools tab.`, then the circular saw actions. |
| A chosen tool over one of its limits (section 8.1) | First `This cut is over a limit of the <tool name>: <limit word> <value>.`, then the actions of that tool. |

The limit words are the labels of the Tools tab, in lower case: "widest rip" (`maxRip`), "longest crosscut"
(`maxCrosscut`), "largest piece" (`maxPiece`, the value is `<length> × <width>`), "longest cut" (`maxCut`), and "most cut
stages" (`maxStages`, the value is a plain number).

The actions end with a full stop. The UI numbers them; the strings do not start with a number.

### 4.5 Results

A rip or a crosscut has two results: the measured side, then the other side. A trim has two results: the strip that
the trim removes (the released side), then the rest. For each side:

- `next` is not null: **next**. The parts are the names on that side (possibly none).
- `next` is null and the side has parts: **part**.
- `next` is null, no parts, and `isOffcutSize` is true: **offcut**.
- Otherwise: **waste**.

`where` for the measured side of a rip or a crosscut:

- table saw, `axis: "y"`: "between the fence and the blade";
- table saw, `axis: "x"`, or panel saw: "at the stop";
- track saw, circular saw, or no tool: "the <measured edge> piece", for example "the top piece".

`where` is null for the other side and for both sides of a trim.

### 4.6 Body

The body joins these sentences with spaces:

1. `Pick up <pickUp>.`
2. Each action, as `<i>. <action>`.
3. Each result, as one sentence that starts with its label. When `where` is set, it follows the label in brackets:
   - part: `Part: A Top, 42 19/32" × 15 3/8".` or `Parts: A Top, A Shelf 1, 59 1/2" × 15 3/8".`
   - next: `Next (between the fence and the blade): 59 1/2" × 15 3/8" with A Top, A Shelf 1, for step 10.`, or
     `Next: 60" × 59 3/4", for step 2.` with no parts
   - offcut: `Offcut: 59 1/2" × 13". Set it aside.`
   - waste: `Waste: 60" × 1/4".`

Example (step 7 above, table saw rip):

> Pick up the panel 59 1/2" × 28 1/2" from step 6. 1. Set the fence 15 3/8" from the blade. 2. Put a 59 1/2" edge of
> the panel against the fence. 3. Make the cut. Next (between the fence and the blade): 59 1/2" × 15 3/8" with A Top,
> A Shelf 1, for step 10. Offcut: 59 1/2" × 13". Set it aside.

## 5. The web app

### 5.1 The current step on the Shop tab

From the top, in `section.shop-current`:

1. The title as the heading (`h2`), as now.
2. The method under it, in a smaller, muted font.
3. `Pick up <pickUp>.` as a paragraph.
4. The actions as an `ol`, in a font of at least 16 px.
5. A "Result" heading and a `ul` with one item for each result. Each item starts with a coloured label:
   **Part** (green), **Next** (blue), **Offcut** (amber), **Waste** (grey). Then the `where` text (if any), the size,
   and the parts. A **Next** item ends with a link button "Go to step 10" that selects that step.
6. The **← Previous**, **Mark done**, and **Next →** buttons, the diagram, and its caption stay as now.

### 5.2 The diagram

`sheetSvg` gets a new option `focus?: boolean`. When `focus` is true and `highlight` is a step on this sheet, the
drawing adds, after the parts and before the cut lines:

- a pale layer over the sheet outside the piece (one `path` with `fill-rule="evenodd"`, white at 55 % opacity), and
- an outline of the piece (`rect` with `data-piece="true"`, dark stroke, no fill), at the coordinates of `step.piece`.

The cut lines draw on top, so the red line and the number of the step stay visible. Only the Shop tab sets `focus`.
The print and the SVG downloads do not change.

### 5.3 The step list

- Each item shows `<n>. <headline>`, for example "7. Cut 15 3/8" off the panel".
- When all the steps of a sheet run have the same tool, the heading of the run is `Sheet <n> · <tool name>`. Otherwise
  the heading is `Sheet <n>`, and each item ends with ` · <tool name>` (or ` · No tool`).
- The checkboxes and the current-step outline do not change.

### 5.4 The printed cut sequence

Each `li` in `SequencePages` keeps its tick box and shows three lines: the title in bold with the method after it; then
`Pick up …` and the numbered actions on one line; then the result sentences on one line.

## 6. The CLI

`report sequence` adds `headline`, `method`, `pickUp`, `actions`, and `results` to each step in the JSON. It keeps
`title` and `body`, with the new body. The text output is:

```
Step 7 · Cut 15 3/8" off the panel
  Table saw · rip: a cut along the length of the sheet
  Pick up the panel 59 1/2" × 28 1/2" from step 6.
  1. Set the fence 15 3/8" from the blade.
  2. Put a 59 1/2" edge of the panel against the fence.
  3. Make the cut.
  Next (between the fence and the blade): 59 1/2" × 15 3/8" with A Top, A Shelf 1, for step 10.
  Offcut: 59 1/2" × 13". Set it aside.
```

The `output` help text of the command lists the new fields.

## 7. The default tools

`newTool(type, units, taken)` in `packages/core/src/edit/tools.ts` gives these default limits (inch / mm):

| Type | Limits |
|---|---|
| Table saw | `maxPiece` 96 × 24 (2440 × 610), `maxRip` 24 (610), `maxCrosscut` 24 (610) |
| Track saw | `maxCut` 110 (2800): a 118" (3000 mm) rail with about 4" at each end |
| Circular saw, panel saw | no limits, as now |

A new function `defaultTools(units)` gives `[table saw, track saw]`, in that order. A new project in the web app
(`newProject` in `Home.tsx`) and `opencutplan new` use it. **Add tool** on the Tools tab and `tools add` in the CLI use
`newTool`, so a new table saw or track saw also gets the defaults.

The reasons, from the research: a full sheet on a table saw is not safe; many jobsite saws and crosscut sleds reach
about 24"; the table saw is better for repeated, fence-referenced parts and narrow strips. With these limits and the
table saw first, a full 96 × 48 sheet (or a 60 × 60 sheet) is over the largest piece of the table saw, so the track
saw makes its trims and first cuts; a strip 95 1/2" × 12" fits the table saw, so the table saw makes its crosscuts.

Existing projects, tool profiles, and the examples do not change.

## 8. Choosing the tool for a cut

### 8.1 Core

- `toolLimit(tool, cut, limits)` in `sequence/tools.ts` returns the first limit of the tool that the cut is over
  (`"maxPiece" | "maxRip" | "maxCrosscut" | "maxCut" | "maxStages"`), or null. `toolCanCut` uses it and does not change
  its behaviour. When the `toolLimits` feature is off, every tool can make every cut.
- The sequence finds the stored choice of each cut (section 8.2). When the choice names an enabled tool, the step uses
  that tool; the measured side is the side `toolCanCut` gives for that tool, or, when the tool is over a limit, the side
  it measures with no limits. Otherwise the step uses the
  recommended tool, as now.
- `Step` gets three fields: `recommended: Tool | null` (the tool the cut analysis picks), `chosen: boolean` (true when
  a stored choice sets the tool), and `overLimit: ToolLimit | null` (the limit of `step.tool` that the cut is over).
- `setToolChoice(project, step, toolId | null)` in `edit/tools.ts` stores or removes the choice. A tool id equal to
  `step.recommended` removes the choice.
- The setup order groups cuts by the tool of the step, so it uses the chosen tool.

### 8.2 The file (format 1.3)

Each plan sheet gets an optional field:

```json
"toolChoices": [{ "axis": "y", "at": 12.375, "from": 0.25, "to": 95.75, "tool": "table-saw" }]
```

- A choice belongs to the cut on the same sheet with the same axis, `at`, `from`, and `to` (within `EPSILON`).
- `withCuts` (the save) keeps only the choices that match a cut of the sheet. **Optimize** makes new sheets, so the
  choices on unpinned sheets go; a pinned sheet keeps them.
- A choice whose tool does not exist gives a `bad-ref` warning, like `cuts[].tool`. A choice whose tool is turned off
  has no effect.
- A change of units converts `at`, `from`, and `to` of each choice, as it converts the placements.
- `FORMAT_VERSION` becomes `"1.3"`. `docs/format.md` describes the field. Readers of 1.2 ignore it, as the minor
  version rules say.

### 8.3 The Shop tab

- Under the title of the current step, a `select` labelled **Tool** lists the enabled tools in order. The option of
  the recommended tool ends with " (recommended)". The option of a tool that is over a limit for this cut ends with
  " (over its <limit word>)", for example "Table saw (over its largest piece)". Every option can be picked.
- A change of the select stores the choice at once (one undo step). The title, the method, the actions, the diagram,
  and the list follow the change.
- **Ticks:** a tick belongs to a cut, not to a step number. When the tool of a cut changes, the Shop tab finds each
  ticked cut in the new steps by its sheet, kind, axis, `at`, `from`, and `to`, and stores the ticks with the new step
  numbers and the new fingerprint, in the same edit. In the setup order, the steps can move; the ticks move with them.
  When the ticks are already out of date (the banner shows), the change of tool leaves them as they are.

### 8.4 The CLI

- `opencutplan layout tool <file> <step> --tool <id>` stores a choice for the cut of that step (in the current order).
  `--recommended` removes it. The command fails with `unknown-tool` for a tool id that does not exist, and with
  `not-found` for a step number that does not exist. Like the other `layout` commands, it has `--dry-run` and `--json`.
- `report sequence --json` adds `recommendedTool` (an id or null), `chosen`, and `overLimit` to each step.

## 9. Errors and edge cases

- A step with no tool: section 4.4 gives the warning action first. The method starts with "No tool".
- A side with many parts: `parts` uses the shortening of `list` (three names, then "and N more").
- The setup order (`orderMode: "setup"`): `requires` can be a step far before this one. The pick-up line still names it.
- A sheet with a missing stock: `describeStep` treats the piece as a panel, as now.
- A stale shop state: the text is for the current steps, as now.
- A chosen tool that the user then turns off: the cut goes back to the recommended tool. The choice stays in the file
  while its cut exists, so it comes back when the tool is turned on again. A deleted tool gives the `bad-ref` warning
  until the user picks another tool for that cut.
- A project with no enabled tool: the Tool select is not shown.

## 10. Testing

- **Core** (`packages/core/test/sequence/text.test.ts`): the title, the method, the pick-up line, the actions, the
  results, and the body for a table saw rip and crosscut, a panel saw cut, a track saw cut, a circular saw cut, a step
  with no tool, the first cut on a full sheet, a cut with the measured side on the remainder, and a trim on each of the
  four edges. The kinds part, next, offcut, and waste each appear at least once. One test uses mm units.
- **Core SVG:** with `focus`, the `data-piece` rect has the coordinates of the piece and the pale path is present;
  without `focus`, neither is present.
- **Web:** the Shop tab test checks the heading, the method, the pick-up line, the numbered actions, the result labels,
  and that "Go to step N" selects that step. It checks the list items and the run heading with one tool. The print test
  checks the three lines of one step.
- **CLI:** the `report sequence` test checks the new JSON fields and the text output.
- **Tools:** `newTool` and `defaultTools` give the limits of section 7 in both units; the sample project with the
  default tools sends the full-sheet cuts to the track saw and the strip crosscuts to the table saw.
- **Tool choice:** a stored choice sets the tool, the measured side, `chosen`, and `overLimit`; a choice for a turned-off
  tool has no effect; `withCuts` drops a choice that matches no cut; the unit change converts a choice; a 1.2 file
  loads; the Shop select changes the text and keeps the ticks (sheet order and setup order); `layout tool` stores and
  removes a choice.
- **e2e:** the Shop part of the plan test checks the pick-up line and the first action of step 1, and changes the tool
  of one step.

## 11. Docs

`docs/cut-analysis.md` (the step text), `docs/web-app.md` (the Shop tab and printing), and `docs/cli.md`
(`report sequence`, `layout tool`) describe the new form. `docs/format.md` describes `toolChoices` and version 1.3.

## 12. Delivery

One implementation plan: the core text, the SVG outline, the default tools, the tool choice in the core and the file,
then the Shop tab, the print, the CLI, and the docs.
