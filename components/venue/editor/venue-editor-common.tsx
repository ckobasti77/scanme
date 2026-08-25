"use client";

// Shared chrome for both Venue editor shells (desktop + mobile): the panel-id
// list with icons and copy, panel grouping, the save-state pill, the compact
// breakpoint hook, and the panel-content dispatcher. Structured like
// components/admin/scanme-links-editor-common.tsx on purpose — the Links file
// is frozen (RFC-001 §2.5 amendment), so this is Venue's own copy of the
// pattern, driven by the venue-editor dictionary instead of inline copy.

import {
  BarChart3,
  Blocks,
  CalendarDays,
  Check,
  CircleHelp,
  Image as ImageIcon,
  LoaderCircle,
  Paintbrush,
  Palette,
  Settings,
  Type,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import { VENUE_BLOCK_REGISTRY } from "@/components/venue/blocks/registry";
import type { VenueBlock } from "@/lib/venue-blocks";
import styles from "./venue-editor.module.css";
import type {
  VenueEditorData,
  VenueEditorEvent,
  VenueEditorPanelId,
} from "./venue-editor-types";

export type VenueEditorToolItem = {
  id: VenueEditorPanelId;
  label: string;
  icon: typeof Blocks;
};

export const primaryToolItems: readonly VenueEditorToolItem[] = [
  { id: "blocks", label: dict.panelBlocksTitle, icon: Blocks },
  { id: "event", label: dict.panelEventTitle, icon: CalendarDays },
  { id: "style", label: dict.panelStyleTitle, icon: Paintbrush },
  { id: "background", label: dict.panelBackgroundTitle, icon: ImageIcon },
  { id: "text", label: dict.panelTextTitle, icon: Type },
  { id: "color", label: dict.panelColorTitle, icon: Palette },
] as const;

export const secondaryToolItems: readonly VenueEditorToolItem[] = [
  { id: "settings", label: dict.panelSettingsTitle, icon: Settings },
  { id: "analytics", label: dict.panelAnalyticsTitle, icon: BarChart3 },
  { id: "help", label: dict.panelHelpTitle, icon: CircleHelp },
] as const;

export const panelCopy: Record<
  VenueEditorPanelId,
  { title: string; description: string }
> = {
  blocks: {
    title: dict.panelBlocksTitle,
    description: dict.panelBlocksDescription,
  },
  event: {
    title: dict.panelEventTitle,
    description: dict.panelEventDescription,
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
  settings: {
    title: dict.panelSettingsTitle,
    description: dict.panelSettingsDescription,
  },
  analytics: {
    title: dict.panelAnalyticsTitle,
    description: dict.panelAnalyticsDescription,
  },
  help: { title: dict.panelHelpTitle, description: dict.panelHelpDescription },
};

export function toolItemFor(panel: VenueEditorPanelId) {
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
// twice (the Links shell's precedent).
export function useCompactVenueEditor() {
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

export function VenueEditorBackdrop() {
  return <div className={styles.backdrop} aria-hidden="true" />;
}

// --- panel bodies -----------------------------------------------------------

function ComingSoonPanel() {
  return <p className={styles.panelPlaceholder}>{dict.panelComingSoon}</p>;
}

const EVENT_STATUS_LABELS: Record<VenueEditorEvent["status"], string> = {
  draft: dict.statusDraft,
  scheduled: dict.statusScheduled,
  live: dict.statusLive,
  ended: dict.statusEnded,
  archived: dict.statusArchived,
};

function EventPanel({ data }: { data: VenueEditorData }) {
  const event = data.event;
  if (!event) return <ComingSoonPanel />;
  return (
    <div className={styles.panelSection}>
      <dl className={styles.factList}>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventTitleLabel}</dt>
          <dd className={styles.factValue}>{event.title}</dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventPathLabel}</dt>
          <dd className={styles.factValue}>
            /{data.businessSlug}/venue/{event.slug}
          </dd>
        </div>
        <div className={styles.factRow}>
          <dt className={styles.factLabel}>{dict.eventStatusLabel}</dt>
          <dd className={styles.factValue}>
            {EVENT_STATUS_LABELS[event.status]}
          </dd>
        </div>
      </dl>
      <ComingSoonPanel />
    </div>
  );
}

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

// The registry's EditorPanel seam, wired but not filled (TASK-10): a selected
// block dispatches to registry[type].EditorPanel when one exists; until
// TASK-11 lands them, the fallback names the block and points at what already
// works. `onChange` is dead weight today by design — it is the exact contract
// the twelve panels will receive.
export function SelectedBlockPanel({
  block,
  onChange,
}: {
  block: VenueBlock;
  onChange: (next: VenueBlock, group?: string) => void;
}) {
  const entry = VENUE_BLOCK_REGISTRY[block.type];
  const Panel = entry.EditorPanel;
  if (Panel) return <>{Panel({ block, onChange })}</>;
  return <p className={styles.panelPlaceholder}>{dict.blockPanelPlaceholder}</p>;
}

export function selectedBlockTitle(block: VenueBlock) {
  return fmt(dict.blockPanelTitle, {
    block: VENUE_BLOCK_REGISTRY[block.type].label,
  });
}

// Panels other than "blocks" (which owns real interaction and lives in
// venue-editor-blocks-panel.tsx): event shows its read-only summary; help is
// real; the rest are honest placeholders until their tasks land.
export function VenueEditorStaticPanelContent({
  panel,
  data,
}: {
  panel: Exclude<VenueEditorPanelId, "blocks">;
  data: VenueEditorData;
}) {
  switch (panel) {
    case "event":
      return <EventPanel data={data} />;
    case "help":
      return <HelpPanel />;
    case "style":
    case "background":
    case "text":
    case "color":
    case "settings":
    case "analytics":
      return <ComingSoonPanel />;
  }
}
