"use client";

// Shared chrome for both Menu editor shells (desktop + mobile): the panel-id
// list with icons and copy, panel grouping, the save-state pill, the compact
// breakpoint hook, and the panel-content dispatcher. FORKED from
// components/venue/editor/venue-editor-common.tsx (RFC-003 §1.a) — Menu's own
// copy of the pattern, driven by the menu-editor dictionary.

import {
  Check,
  CircleHelp,
  Clock3,
  Image as ImageIcon,
  LayoutList,
  LoaderCircle,
  Paintbrush,
  Palette,
  Type,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import { MENU_GROUP_REGISTRY } from "@/components/menu/blocks/registry";
import type { MenuGroup } from "@/lib/menu-blocks";
import { MENU_GROUP_EDITOR_PANELS } from "./menu-editor-group-panels";
import styles from "./menu-editor.module.css";
import type { MenuEditorPanelId } from "./menu-editor-types";

export type MenuEditorToolItem = {
  id: MenuEditorPanelId;
  label: string;
  icon: typeof LayoutList;
};

export const primaryToolItems: readonly MenuEditorToolItem[] = [
  { id: "groups", label: dict.panelGroupsTitle, icon: LayoutList },
  { id: "style", label: dict.panelStyleTitle, icon: Paintbrush },
  { id: "background", label: dict.panelBackgroundTitle, icon: ImageIcon },
  { id: "text", label: dict.panelTextTitle, icon: Type },
  { id: "color", label: dict.panelColorTitle, icon: Palette },
] as const;

export const secondaryToolItems: readonly MenuEditorToolItem[] = [
  { id: "dayparts", label: dict.panelDaypartsTitle, icon: Clock3 },
  { id: "help", label: dict.panelHelpTitle, icon: CircleHelp },
] as const;

export const panelCopy: Record<
  MenuEditorPanelId,
  { title: string; description: string }
> = {
  groups: {
    title: dict.panelGroupsTitle,
    description: dict.panelGroupsDescription,
  },
  style: {
    title: dict.panelStyleTitle,
    description: dict.panelStyleDescription,
  },
  background: {
    title: dict.panelBackgroundTitle,
    description: dict.panelBackgroundDescription,
  },
  text: { title: dict.panelTextTitle, description: dict.panelTextDescription },
  color: {
    title: dict.panelColorTitle,
    description: dict.panelColorDescription,
  },
  dayparts: {
    title: dict.panelDaypartsTitle,
    description: dict.panelDaypartsDescription,
  },
  help: { title: dict.panelHelpTitle, description: dict.panelHelpDescription },
};

export function toolItemFor(panel: MenuEditorPanelId) {
  return (
    primaryToolItems.find((item) => item.id === panel) ??
    secondaryToolItems.find((item) => item.id === panel)!
  );
}

const COMPACT_EDITOR_QUERY = "(max-width: 1099px)";

function subscribeToCompactEditor(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia(COMPACT_EDITOR_QUERY);
  mediaQuery.addEventListener("change", onStoreChange);
  // resize as a backup signal: under DevTools/WebView viewport emulation the
  // matchMedia "change" event can be skipped even though .matches flipped.
  window.addEventListener("resize", onStoreChange);
  return () => {
    mediaQuery.removeEventListener("change", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
}

function readCompactEditor() {
  return window.matchMedia(COMPACT_EDITOR_QUERY).matches;
}

// Below this width the mobile shell mounts instead of the desktop layout — a
// JS switch, not display:none, so the preview and DnD context never mount
// twice.
export function useCompactMenuEditor() {
  return useSyncExternalStore(
    subscribeToCompactEditor,
    readCompactEditor,
    () => false,
  );
}

const saveStateLabels = {
  saved: dict.saveStateSaved,
  saving: dict.saveStateSaving,
  error: dict.saveStateError,
} as const;

export function saveStateLabel(state: keyof typeof saveStateLabels) {
  return saveStateLabels[state];
}

// Honest save state: saving / saved / failed. The failed state is a BUTTON —
// clicking it retries the save — and carries the error text for screen
// readers, so a failure is never silent and never a dead end.
export function SaveStatus({
  state,
  error,
  onRetry,
}: {
  state: keyof typeof saveStateLabels;
  error: string | null;
  onRetry: () => void;
}) {
  const dot = (
    <span className={styles.saveStateDot} aria-hidden="true">
      {state === "saving" ? (
        <LoaderCircle className="size-3 animate-spin" />
      ) : state === "error" ? (
        <span>!</span>
      ) : (
        <Check className="size-3" />
      )}
    </span>
  );

  if (state === "error") {
    return (
      <button
        type="button"
        className={styles.saveState}
        data-state="error"
        onClick={onRetry}
        title={error ?? dict.saveErrorFallback}
      >
        {dot}
        <span role="status">
          {saveStateLabels.error} · {dict.saveRetryHint}
        </span>
      </button>
    );
  }

  return (
    <span className={styles.saveState} data-state={state}>
      {dot}
      <span role="status">{saveStateLabels[state]}</span>
    </span>
  );
}

export function MenuEditorBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" />;
}

// --- panel bodies -----------------------------------------------------------

function HelpPanel() {
  const items = [
    { title: dict.helpAddTitle, body: dict.helpAddBody },
    { title: dict.helpReorderTitle, body: dict.helpReorderBody },
    { title: dict.helpUndoTitle, body: dict.helpUndoBody },
    { title: dict.helpPublishTitle, body: dict.helpPublishBody },
  ];
  return (
    <ul className={styles.helpList}>
      {items.map((item) => (
        <li key={item.title}>
          <h3 className={styles.helpTitle}>{item.title}</h3>
          <p className={styles.helpBody}>{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

// The registry's EditorPanel seam, filled editor-side: the panel map extends
// the registry entries exactly as the registry's header promises — the render
// path never imports a panel, this editor module does. Dispatch order: the
// editor map, then any entry-level EditorPanel, then a naming placeholder.
export function SelectedGroupPanel({
  group,
  onChange,
}: {
  group: MenuGroup;
  onChange: (next: MenuGroup, historyGroup?: string) => void;
}) {
  const Panel =
    MENU_GROUP_EDITOR_PANELS[group.shape] ??
    MENU_GROUP_REGISTRY[group.shape].EditorPanel;
  if (Panel) return <>{Panel({ group, onChange })}</>;
  return <p className={styles.panelPlaceholder}>{dict.groupPanelPlaceholder}</p>;
}

export function groupDisplayName(group: MenuGroup) {
  return group.base.title.trim() || dict.groupUntitled;
}

export function selectedGroupTitle(group: MenuGroup) {
  return fmt(dict.groupPanelTitle, { group: groupDisplayName(group) });
}

// The one panel with no document to edit.
export function MenuEditorStaticPanelContent({ panel }: { panel: "help" }) {
  switch (panel) {
    case "help":
      return <HelpPanel />;
  }
}
