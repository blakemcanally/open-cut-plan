import {
  addSheet,
  clearsKerf,
  contains,
  copyLabel,
  describeGoal,
  describeGroupSpread,
  extraCostPercent,
  findCopy,
  findFreeSpot,
  partColors,
  moveCopyTo,
  moveToTray,
  nudgeCopy,
  orientedSize,
  placeCopy,
  projectGoal,
  pushSheetToFactoryEdges,
  pushToFactoryEdges,
  removeEmptySheets,
  removeSheet,
  rotateCopy,
  setPinned,
  sheetRects,
  stockLabel,
  toolColors,
  unplacedCopies,
  usableRect,
  type CopyRef,
  type ProjectAnalysis,
  type Rect,
  type Size,
  type UnplacedReason,
} from "@opencutplan/core";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { RUN_NAMES, type OptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
import type { ViewPrefs } from "../state/prefs.ts";
import type { ProjectStore } from "../state/useProject.ts";
import { ColorLegend } from "./ColorLegend.tsx";
import { CutLegend } from "./CutLegend.tsx";
import { fitScale, WINDOW_ALLOWANCE } from "./fit.ts";
import { Inspector } from "./Inspector.tsx";
import { IssueList } from "./IssueList.tsx";
import { comparisonText, statsText } from "./runSummary.ts";
import { sheetSummary } from "./sheetSummary.ts";
import { copyKey, SheetView, type DropPreview } from "./SheetView.tsx";
import { snapPosition, type Snapped } from "./snap.ts";
import { Tray } from "./Tray.tsx";

const SNAP_PX = 12;
const DRAG_START_PX = 4;
const ZOOM_STEP = 1.25;

type DropTarget =
  | { kind: "sheet"; sheet: string; x: number; y: number; bad: boolean; guides: Snapped["guides"]; left: number; top: number }
  | { kind: "tray" };

interface Drag {
  ref: CopyRef;
  size: Size;
  rotated: boolean;
  /** Pointer position inside the part, in project units. */
  grab: { x: number; y: number };
  start: { x: number; y: number };
  client: { x: number; y: number };
  started: boolean;
  target: DropTarget | null;
  /** The Alt key state of the last move, for a recomputed target during a scroll. */
  free: boolean;
}

interface LayoutTabProps {
  store: ProjectStore;
  analysis: ProjectAnalysis;
  prefs: ViewPrefs;
  onPrefs(prefs: ViewPrefs): void;
  runs: OptimizeRuns;
  onShowSettings(): void;
  onOpenStep(step: number): void;
}

/** The nudge step: one display step, or 1 in / 25 mm with Shift. */
export function nudgeStep(analysis: ProjectAnalysis, big: boolean): number {
  const { units, display } = analysis.context;
  if (units === "in") return big ? 1 : display.inch === "decimal" ? 0.01 : 1 / display.inch;
  return big ? 25 : display.mm;
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
}

export function LayoutTab({ store, analysis, prefs, onPrefs, runs, onShowSettings, onOpenStep }: LayoutTabProps) {
  const { project, edit } = store;
  const ctx = analysis.context;
  const busy = runs.running !== null;
  const [selected, setSelected] = useState<CopyRef | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(800);
  const [windowHeight, setWindowHeight] = useState(() => window.innerHeight);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [stockChoice, setStockChoice] = useState("");
  const focusAfter = useRef<CopyRef | null>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;

  const sheets = project.plan?.sheets ?? [];
  const colors = useMemo(() => partColors(project), [project]);
  const tools = useMemo(() => toolColors(ctx.tools), [ctx.tools]);
  const unplaced = useMemo(() => unplacedCopies(project), [project]);
  const pushable = useMemo(() => new Set((ctx.project.plan?.sheets ?? []).filter((sheet) => pushToFactoryEdges(ctx, sheet) !== null).map((sheet) => sheet.id)), [ctx]);
  const enabledStock = project.stock.filter((stock) => stock.enabled !== false);
  const chosenStock = enabledStock.find((stock) => stock.id === stockChoice) ?? enabledStock[0];

  const sizes = sheets.length > 0 ? sheets.flatMap((sheet) => ctx.stock.get(sheet.stock) ?? []) : enabledStock;
  const largest = { length: Math.max(1, ...sizes.map((s) => s.length)), width: Math.max(1, ...sizes.map((s) => s.width)) };
  const scale = Math.max(0.02, fitScale(largest, sheets.length, { width, height: windowHeight - WINDOW_ALLOWANCE }) * zoom);

  useEffect(() => {
    const element = sheetsRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && entry.contentRect.width > 0 && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const resize = () => setWindowHeight(window.innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    const ref = focusAfter.current;
    if (!ref) return;
    focusAfter.current = null;
    const key = copyKey(ref);
    [...document.querySelectorAll<HTMLElement | SVGElement>("[data-copy-key]")].find((element) => element.dataset.copyKey === key)?.focus();
  });

  useEffect(() => {
    if (selected && !ctx.parts.has(selected.part)) setSelected(null);
  }, [ctx, selected]);

  const errorsBySheet = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const issue of analysis.issues) {
      if (issue.severity !== "error") continue;
      for (const ref of issue.refs) {
        if (ref.kind !== "placement") continue;
        map.set(ref.sheet, (map.get(ref.sheet) ?? new Set()).add(ref.index));
      }
    }
    return map;
  }, [analysis.issues]);

  const reasons = useMemo(
    () => new Map<string, UnplacedReason>((runs.current?.result.unplaced ?? []).map((u) => [copyKey(u), u.reason])),
    [runs.current],
  );

  const select = (ref: CopyRef | null) => {
    setSelected(ref);
    setMessage(null);
  };

  const sizeOf = (ref: CopyRef, rotated: boolean): Size | null => {
    const part = ctx.parts.get(ref.part);
    return part ? orientedSize(part, rotated) : null;
  };

  const locate = (ref: CopyRef, sheetId: string | null) => {
    if (sheetId === null) {
      edit((p) => moveToTray(p, ref));
      focusAfter.current = ref;
      return;
    }
    const sheet = sheets.find((s) => s.id === sheetId);
    const rotated = findCopy(project, ref)?.placement.rotated ?? false;
    const size = sizeOf(ref, rotated);
    if (!sheet || !size) return;
    const spot = findFreeSpot(ctx, sheet, size, ref);
    const index = sheets.indexOf(sheet) + 1;
    if (!spot) {
      setMessage(`Sheet ${index} has no free space for this part.`);
      return;
    }
    setMessage(null);
    edit((p) => placeCopy(p, ref, sheet.id, spot.x, spot.y, rotated));
    focusAfter.current = ref;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEditable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Escape") {
      if (dragRef.current) setDrag(null);
      else select(null);
      return;
    }
    if (!(event.target instanceof Element) || !event.target.closest("[data-copy-key], svg[data-sheet]") || event.target.closest("[data-step]")) return;
    if (!selected || busy || !findCopy(project, selected)) return;
    const step = nudgeStep(analysis, event.shiftKey);
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (event.key === "r" || event.key === "R") {
      edit((p) => rotateCopy(p, selected));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      edit((p) => moveToTray(p, selected));
      focusAfter.current = selected;
    } else if (moves[event.key]) {
      const [dx, dy] = moves[event.key]!;
      edit((p) => nudgeCopy(p, selected, dx, dy), `nudge:${copyKey(selected)}`);
    } else {
      return;
    }
    event.preventDefault();
  };

  const target = (clientX: number, clientY: number, current: Drag, freeMove: boolean): DropTarget | null => {
    const elements = document.elementsFromPoint?.(clientX, clientY) ?? [];
    for (const element of elements) {
      if (element.closest("[data-tray]")) return { kind: "tray" };
      const svg = element.closest<SVGSVGElement>("svg[data-sheet]");
      if (!svg) continue;
      const sheet = sheets.find((s) => s.id === svg.dataset.sheet);
      const stock = sheet && ctx.stock.get(sheet.stock);
      const part = ctx.parts.get(current.ref.part);
      if (!sheet || !stock || !part) return null;
      const box = svg.getBoundingClientRect();
      const others = sheetRects(ctx, sheet, current.ref);
      const usable = usableRect(ctx, stock);
      let x = (clientX - box.left) / scale - current.grab.x;
      let y = (clientY - box.top) / scale - current.grab.y;
      let guides: Snapped["guides"] = { x: null, y: null };
      const fits = (fitX: number, fitY: number) => {
        const rect: Rect = { x: fitX, y: fitY, ...current.size };
        return contains(usable, rect) && others.every((other) => clearsKerf(other, rect, ctx.kerf));
      };
      if (ctx.features.snapping && !freeMove) {
        ({ x, y, guides } = snapPosition({
          x,
          y,
          size: current.size,
          sheet: { x: 0, y: 0, length: stock.length, width: stock.width },
          usable,
          others,
          kerf: ctx.kerf,
          threshold: SNAP_PX / scale,
          grid: prefs.grid[ctx.units],
          fits,
        }));
      }
      const bad = part.material !== stock.material || !fits(x, y);
      return { kind: "sheet", sheet: sheet.id, x, y, bad, guides, left: box.left + x * scale, top: box.top + y * scale };
    }
    return null;
  };
  const targetRef = useRef(target);
  targetRef.current = target;

  const startDrag = (event: ReactPointerEvent, ref: CopyRef, grab: { x: number; y: number } | null) => {
    if (busy || event.button !== 0) return;
    const rotated = findCopy(project, ref)?.placement.rotated ?? false;
    const size = sizeOf(ref, rotated);
    if (!size) return;
    select(ref);
    const box = event.currentTarget.getBoundingClientRect();
    const inside = grab ?? { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
    const point = { x: event.clientX, y: event.clientY };
    setDrag({ ref, size, rotated, grab: inside, start: point, client: point, started: false, target: null, free: false });
  };

  const dragActive = drag !== null;
  useEffect(() => {
    if (!dragActive) return;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const moved = Math.hypot(event.clientX - current.start.x, event.clientY - current.start.y) >= DRAG_START_PX;
      if (!current.started && !moved) return;
      setDrag({
        ...current,
        started: true,
        client: { x: event.clientX, y: event.clientY },
        free: event.altKey,
        target: targetRef.current(event.clientX, event.clientY, current, event.altKey),
      });
    };
    const up = () => {
      const current = dragRef.current;
      setDrag(null);
      if (!current?.started || !current.target) return;
      const drop = current.target;
      if (drop.kind === "tray") edit((p) => moveToTray(p, current.ref));
      else edit((p) => placeCopy(p, current.ref, drop.sheet, drop.x, drop.y, current.rotated));
    };
    const scroll = () => {
      const current = dragRef.current;
      if (!current?.started) return;
      setDrag({ ...current, target: targetRef.current(current.client.x, current.client.y, current, current.free) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("scroll", scroll, { capture: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("scroll", scroll, { capture: true });
    };
  }, [dragActive, edit]);

  const dragging = drag?.started ? drag.ref : null;
  const progress = runs.running ? Math.min(1, (Date.now() - runs.running.startedAt) / runs.running.timeLimitMs) : 0;
  const canOptimize = !busy && project.parts.length > 0 && enabledStock.length > 0;
  const goal = describeGoal(projectGoal(project), project.settings.optimizer.extraCostPercent);
  const extraCosts = (runs.current?.result.materials ?? [])
    .map((m) => ({ name: project.materials.find((material) => material.id === m.material)?.name ?? m.material, percent: extraCostPercent(m.score.cost, m.cheapestCost) }))
    .filter((m) => m.percent > 0);
  const groupText = runs.current && project.settings.optimizer.keepGroupsTogether ? describeGroupSpread(project) : null;
  const outcome = runs.outcome;
  const runText = runs.error
    ? `✖ The optimizer failed: ${runs.error}`
    : runs.undone
      ? "The plan from before the optimize run is back. Redo puts the new plan back."
      : outcome?.changed
        ? `${runs.notice} ${comparisonText(ctx, outcome.before, outcome.after)}`
        : runs.notice;

  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- layout shortcuts for the focused part or sheet bubble up to this element
    <div className="layout" onKeyDown={onKeyDown}>
      <div className="toolbar" role="toolbar" aria-label="Layout">
        <button type="button" className="primary" disabled={!canOptimize} onClick={() => runs.optimize("all")} title="Plan every part again. Pinned sheets stay as they are.">
          Optimize
        </button>
        <button type="button" disabled={!canOptimize || unplaced.length === 0} onClick={() => runs.optimize("rest")} title="Keep every sheet and plan only the unplaced parts.">
          Optimize the rest
        </button>
        <button type="button" disabled={busy || !runs.current} onClick={runs.keepSearching} title="Continue the last search from its best plan.">
          Keep searching
        </button>
        <span className="run-status">
          {busy && (
            <>
              <button type="button" onClick={runs.stop}>
                Stop
              </button>
              <progress max={1} value={progress} aria-label="Optimizer progress" />
              <span className="muted" aria-live="polite">
                {runs.running?.best ? `${runs.running.best.iterations.toLocaleString()} plans tried` : "Starting…"}
              </span>
            </>
          )}
        </span>
        <span className="spacer" />
        <label className="inline">
          Stock
          <select value={chosenStock?.id ?? ""} onChange={(event) => setStockChoice(event.target.value)} disabled={busy || enabledStock.length === 0}>
            {enabledStock.map((stock) => (
              <option key={stock.id} value={stock.id}>
                {stockLabel(ctx, stock)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || !chosenStock} onClick={() => chosenStock && edit((p) => addSheet(p, chosenStock.id).project)}>
          Add sheet
        </button>
        <button type="button" disabled={busy || !sheets.some((s) => s.placements.length === 0)} onClick={() => edit(removeEmptySheets)}>
          Remove empty sheets
        </button>
        <span className="zoom" role="group" aria-label="Zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / ZOOM_STEP))}>
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * ZOOM_STEP))}>
            +
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            Fit
          </button>
        </span>
      </div>
      <p className="muted">
        Goal: {goal}.{" "}
        <button type="button" className="link" onClick={onShowSettings}>
          Change
        </button>
        {extraCosts.map((m) => (
          <span key={m.name}> {`${m.name}: ${m.percent} % more cost than the cheapest plan found.`}</span>
        ))}
        {groupText && <span> {groupText}</span>}
      </p>
      {runText && (
        <div className={`banner run-result${runs.error ? " error" : ""}`}>
          <p role="status">{runText}</p>
          {outcome?.changed && (
            <button type="button" onClick={runs.undo} title={`Puts back the plan from before ${RUN_NAMES[outcome.kind]}: ${statsText(ctx, outcome.before)}. Undo does the same.`}>
              Undo optimize
            </button>
          )}
        </div>
      )}
      {project.parts.length === 0 && <p className="muted">Add parts on the Parts tab first.</p>}
      {project.parts.length > 0 && enabledStock.length === 0 && <p className="muted">Add stock on the Stock tab to lay out or optimize.</p>}
      <div className="layout-body">
        <div className="layout-main">
          <Tray
            ctx={ctx}
            copies={unplaced}
            colors={colors}
            reasons={reasons}
            selected={selected}
            dropping={drag?.target?.kind === "tray"}
            onPointerDown={(event, ref) => {
              const size = sizeOf(ref, false);
              if (size) startDrag(event, ref, { x: size.length / 2, y: size.width / 2 });
            }}
            onSelect={select}
          />
          <div className="sheets" ref={sheetsRef}>
            {sheets.length === 0 && <p className="muted">No sheets yet. Press Optimize, or add a sheet and drag parts onto it.</p>}
            {sheets.map((sheet, index) => {
              const drop = drag?.started && drag.target?.kind === "sheet" && drag.target.sheet === sheet.id ? drag.target : null;
              const preview: DropPreview | null = drop && drag ? { rect: { x: drop.x, y: drop.y, ...drag.size }, bad: drop.bad, guides: drop.guides } : null;
              return (
                <SheetView
                  key={sheet.id}
                  ctx={ctx}
                  sheet={sheet}
                  number={index + 1}
                  scale={scale}
                  steps={analysis.steps.filter((step) => step.sheet === sheet.id)}
                  colors={colors}
                  summary={sheetSummary(analysis, sheet.id)}
                  currency={project.settings.currency}
                  cutColors={prefs.cutColors}
                  tools={tools}
                  errors={errorsBySheet.get(sheet.id) ?? new Set()}
                  selected={selected}
                  dragging={dragging}
                  preview={preview}
                  showCuts={prefs.showCuts && ctx.features.cutOrder}
                  showKerf={prefs.showKerf}
                  grid={ctx.features.snapping ? prefs.grid[ctx.units] : 0}
                  busy={busy}
                  onPartPointerDown={(event, ref) => startDrag(event, ref, null)}
                  onSelect={select}
                  onTogglePin={() => edit((p) => setPinned(p, sheet.id, !sheet.pinned))}
                  onRemove={() => edit((p) => removeSheet(p, sheet.id))}
                  onOpenStep={onOpenStep}
                  onPushToFactoryEdges={pushable.has(sheet.id) ? () => edit((p) => pushSheetToFactoryEdges(p, sheet.id)) : undefined}
                />
              );
            })}
          </div>
        </div>
        <aside className="layout-side">
          <ColorLegend colors={colors} />
          {prefs.showCuts && ctx.features.cutOrder && (
            <CutLegend coloring={prefs.cutColors} tools={tools} steps={analysis.steps} onColoring={(cutColors) => onPrefs({ ...prefs, cutColors })} />
          )}
          <Inspector
            ctx={ctx}
            project={project}
            selected={selected}
            busy={busy}
            message={message}
            onLocation={(sheet) => selected && locate(selected, sheet)}
            onMove={(x, y) => selected && edit((p) => moveCopyTo(p, selected, x, y))}
            onRotate={() => selected && edit((p) => rotateCopy(p, selected))}
          />
          <IssueList
            project={project}
            issues={analysis.issues}
            onShow={(ref) => {
              select(ref);
              focusAfter.current = ref;
            }}
          />
        </aside>
      </div>
      {drag?.started && (
        <div
          className={`ghost${drag.target?.kind === "sheet" && drag.target.bad ? " bad" : ""}`}
          aria-hidden="true"
          style={{
            left: drag.target?.kind === "sheet" ? drag.target.left : drag.client.x - drag.grab.x * scale,
            top: drag.target?.kind === "sheet" ? drag.target.top : drag.client.y - drag.grab.y * scale,
            width: drag.size.length * scale,
            height: drag.size.width * scale,
          }}
        >
          {(() => {
            const part = ctx.parts.get(drag.ref.part);
            return part ? copyLabel(part, drag.ref.copy) : "";
          })()}
        </div>
      )}
    </div>
  );
}
