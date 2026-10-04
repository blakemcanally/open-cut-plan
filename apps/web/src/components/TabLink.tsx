import { createContext, useContext, type ReactNode } from "react";
import type { SettingsSectionId } from "../screens/SettingsTab.tsx";
import type { TabId } from "../screens/Workspace.tsx";

export const ShowTab = createContext<((tab: TabId, section?: SettingsSectionId) => void) | null>(null);

/** A link to another tab of the workspace, and to a section of the Settings tab; plain text outside the workspace. */
export function TabLink({ tab, section, children }: { tab: TabId; section?: SettingsSectionId; children: ReactNode }) {
  const show = useContext(ShowTab);
  if (!show) return <>{children}</>;
  return (
    <button type="button" className="link tab-link" onClick={() => show(tab, section)}>
      {children}
    </button>
  );
}
