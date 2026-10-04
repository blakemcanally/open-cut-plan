import { analyzeProject, errorMessage, planAlert, projectFileName, serializeProjectChecked, withCuts, type Project } from "@opencutplan/core";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TextInput } from "../components/fields.tsx";
import { PlanAlertBanner } from "../components/PlanAlertBanner.tsx";
import { ShowTab } from "../components/TabLink.tsx";
import { LayoutTab } from "../layout/LayoutTab.tsx";
import { useOptimizeRuns } from "../optimizer/useOptimizeRuns.ts";
import { PrintView, type PrintJob } from "../print/PrintView.tsx";
import { ReportsTab } from "../reports/ReportsTab.tsx";
import type { WorkerFactory } from "../optimizer/useOptimizer.ts";
import { usePrefs } from "../state/prefs.ts";
import { useAutosave } from "../state/useAutosave.ts";
import { ShopTab } from "../shop/ShopTab.tsx";
import { useProject } from "../state/useProject.ts";
import type { Storage } from "../storage/db.ts";
import { saveProjectFile } from "../storage/files.ts";
import { DesignTab } from "./DesignTab.tsx";
import { PartsTab } from "./PartsTab.tsx";
import { SettingsTab, type SettingsSectionId } from "./SettingsTab.tsx";
import { StockTab } from "./StockTab.tsx";
import { ToolsTab } from "./ToolsTab.tsx";

export const TABS = [
  { id: "design", label: "Design" },
  { id: "parts", label: "Parts" },
  { id: "stock", label: "Stock" },
  { id: "tools", label: "Tools" },
  { id: "layout", label: "Layout" },
  { id: "shop", label: "Shop" },
  { id: "reports", label: "Reports" },
  { id: "settings", label: "Settings" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

interface WorkspaceProps {
  id: string;
  initial: Project;
  notices: string[];
  handle?: FileSystemFileHandle | undefined;
  stored?: boolean;
  storage: Storage;
  workerFactory: WorkerFactory;
  onHome(): void;
}

function isEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));
}

export function Workspace({ id, initial, notices: initialNotices, handle: initialHandle, stored = false, storage, workerFactory, onHome }: WorkspaceProps) {
  const store = useProject(initial);
  const { project, edit } = store;
  const analysis = useMemo(() => analyzeProject(project), [project]);
  const alert = useMemo(() => planAlert(analysis.context, analysis.issues), [analysis]);
  const errors = analysis.issues.filter((issue) => issue.severity === "error").length;
  const runs = useOptimizeRuns(store, workerFactory);
  const [prefs, setPrefs] = usePrefs();
  const [tab, setTab] = useState<TabId>(initial.parts.length > 0 ? "layout" : "design");
  const [focusProblems, setFocusProblems] = useState(false);
  const [notices, setNotices] = useState(initialNotices);
  const [handle, setHandle] = useState(initialHandle);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [designFocus, setDesignFocus] = useState<string | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("units");
  const [shopStep, setShopStep] = useState<number | null>(null);
  const endPrint = useCallback(() => setPrintJob(null), []);
  const saveError = useAutosave(storage, id, project, stored);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || isEditable(event.target) || document.querySelector('[aria-modal="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) store.undo();
      else if ((key === "z" && event.shiftKey) || key === "y") store.redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store]);

  useEffect(() => {
    if (!focusProblems || tab !== "layout") return;
    setFocusProblems(false);
    document.getElementById("issues-title")?.focus();
  }, [focusProblems, tab]);

  const save = async (as: boolean) => {
    try {
      const text = serializeProjectChecked(withCuts(project));
      const next = await saveProjectFile(text, projectFileName(project.project.name), as ? undefined : handle);
      if (next === null) return;
      setHandle(next);
      setFileStatus(next ? `Saved to ${next.name}.` : "The file was downloaded.");
    } catch (e) {
      setFileStatus(`The file could not be saved: ${errorMessage(e)}`);
    }
  };

  const showTab = (next: TabId) => {
    setShopStep(null);
    setTab(next);
  };

  const showLinked = (next: TabId, section?: SettingsSectionId) => {
    if (section) setSettingsSection(section);
    showTab(next);
  };

  const showProblems = () => {
    showTab("layout");
    setFocusProblems(true);
  };

  const onTabKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = TABS.findIndex((t) => t.id === tab);
    const next = event.key === "ArrowRight" ? index + 1 : event.key === "ArrowLeft" ? index - 1 : null;
    if (next === null) return;
    const target = TABS[(next + TABS.length) % TABS.length]!;
    showTab(target.id);
    document.getElementById(`tab-${target.id}`)?.focus();
    event.preventDefault();
  };

  return (
    <div className="workspace">
      <header className="app-head">
        <button type="button" onClick={onHome}>
          ← Projects
        </button>
        <TextInput
          className="project-name"
          aria-label="Project name"
          value={project.project.name}
          required
          onChange={(name) => edit((p) => ({ ...p, project: { ...p.project, name } }))}
        />
        <button type="button" onClick={store.undo} disabled={!store.canUndo} aria-keyshortcuts="Meta+Z Control+Z">
          Undo
        </button>
        <button type="button" onClick={store.redo} disabled={!store.canRedo} aria-keyshortcuts="Meta+Shift+Z Control+Y">
          Redo
        </button>
        <span className="spacer" />
        <button type="button" onClick={() => void save(false)}>
          Save file
        </button>
        <button type="button" onClick={() => void save(true)}>
          Save as…
        </button>
      </header>
      {saveError && (
        <p role="alert" className="banner error">
          ✖ This browser could not save the project ({saveError}). Use Save file to keep your work.
        </p>
      )}
      {notices.length > 0 && (
        <div role="status" className="banner">
          {notices.map((notice, index) => (
            <p key={index}>⚠ {notice}</p>
          ))}
          <button type="button" onClick={() => setNotices([])}>
            Dismiss
          </button>
        </div>
      )}
      {fileStatus && (
        <div role="status" className="banner">
          <p>{fileStatus}</p>
          <button type="button" onClick={() => setFileStatus(null)}>
            Dismiss
          </button>
        </div>
      )}
      {/* oxlint-disable-next-line jsx-a11y/interactive-supports-focus -- focus goes to the tabs; the tablist handles their arrow keys */}
      <div role="tablist" aria-label="Project" className="tabs" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            aria-describedby={t.id === "layout" && errors > 0 ? "layout-errors" : undefined}
            onClick={() => showTab(t.id)}
          >
            {t.label}
            {t.id === "layout" && errors > 0 && (
              <span className="tab-badge" aria-hidden="true">
                {errors}
              </span>
            )}
          </button>
        ))}
      </div>
      {errors > 0 && (
        <span id="layout-errors" className="visually-hidden">
          The plan has {errors} {errors === 1 ? "error" : "errors"}.
        </span>
      )}
      <ShowTab.Provider value={showLinked}>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel">
          {(tab === "shop" || tab === "reports") && alert && <PlanAlertBanner alert={alert} onShow={showProblems} />}
          {tab === "design" && (
            <DesignTab
              store={store}
              analysis={analysis}
              focus={designFocus}
              optimizing={runs.running !== null}
              onOptimize={() => {
                runs.optimize("all");
                showTab("layout");
              }}
            />
          )}
          {tab === "parts" && (
            <PartsTab
              store={store}
              onShowDesign={(design) => {
                setDesignFocus(design);
                setTab("design");
              }}
            />
          )}
          {tab === "stock" && <StockTab store={store} />}
          {tab === "tools" && <ToolsTab store={store} storage={storage} />}
          {tab === "layout" && (
            <LayoutTab
              store={store}
              analysis={analysis}
              prefs={prefs}
              onPrefs={setPrefs}
              runs={runs}
              onShowSettings={() => {
                setSettingsSection("optimizer");
                setTab("settings");
              }}
              onOpenStep={(step) => {
                setShopStep(step);
                setTab("shop");
              }}
            />
          )}
          {tab === "shop" && <ShopTab store={store} analysis={analysis} onPrint={setPrintJob} openStep={shopStep} cutColors={prefs.cutColors} />}
          {tab === "reports" && <ReportsTab store={store} analysis={analysis} prefs={prefs} onPrefs={setPrefs} onPrint={setPrintJob} />}
          {tab === "settings" && <SettingsTab store={store} prefs={prefs} onPrefs={setPrefs} section={settingsSection} onSection={setSettingsSection} />}
        </div>
      </ShowTab.Provider>
      {printJob && <PrintView job={printJob} analysis={analysis} onDone={endPrint} />}
    </div>
  );
}
