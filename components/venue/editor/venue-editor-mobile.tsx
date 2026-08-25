"use client";

// The compact Venue editor shell (< 1100px): full-height preview canvas, a
// horizontally scrolling tool dock, and a draggable bottom sheet per panel —
// the same grammar as the frozen Links mobile shell, rebuilt here because the
// Venue editor is standalone by design (RFC-001 §2.5 amendment). On a phone
// the canvas IS the phone: the preview page renders edge-to-edge in the card,
// no bezel, mobile-first by construction.

import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
} from "framer-motion";
import {
  Check,
  ChevronLeft,
  LoaderCircle,
  Redo2,
  Send,
  Undo2,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useId,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import {
  panelCopy,
  primaryToolItems,
  saveStateLabel,
  secondaryToolItems,
  VenueEditorBackdrop,
  type VenueEditorToolItem,
} from "./venue-editor-common";
import { InteractiveVenuePreviewPage } from "./venue-editor-preview";
import styles from "./venue-editor.module.css";
import type {
  VenueEditorData,
  VenueEditorDocument,
  VenueEditorPanelId,
  VenueEditorSaveState,
  VenueEditorSelection,
} from "./venue-editor-types";

export function VenueEditorMobileShell({
  data,
  document,
  saveState,
  saveError,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onExplicitSave,
  onOpenPublish,
  activePanel,
  onPanelSelect,
  onClosePanel,
  selection,
  onClearSelection,
  onSelectBlock,
  onSelectPage,
  onReorder,
  panelContent,
}: {
  data: VenueEditorData;
  document: VenueEditorDocument;
  saveState: VenueEditorSaveState;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExplicitSave: () => void;
  onOpenPublish: () => void;
  activePanel: VenueEditorPanelId | null;
  onPanelSelect: (panel: VenueEditorPanelId) => void;
  onClosePanel: () => void;
  selection: VenueEditorSelection;
  onClearSelection: () => void;
  onSelectBlock: (id: string) => void;
  onSelectPage: () => void;
  onReorder: (activeId: string, overId: string) => void;
  panelContent: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const dockScrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activePanel) return;
    const target = dockScrollerRef.current?.querySelector<HTMLElement>(
      `[data-tool-id="${activePanel}"]`,
    );
    target?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [activePanel, reducedMotion]);

  function handleCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("button,a,input,textarea,select,[role='button']")) {
      return;
    }
    // A tap on empty canvas: clear the selection and drop the open sheet so
    // the whole preview is visible again.
    onClearSelection();
    if (activePanel) onClosePanel();
  }

  return (
    <div className={styles.mobileEditor}>
      <VenueEditorBackdrop />

      <header className={styles.mobileTopBar}>
        <Link
          className={styles.mobileIconButton}
          href="/admin/venue"
          aria-label={dict.backAria}
        >
          <ChevronLeft className="size-[19px]" aria-hidden="true" />
        </Link>
        <div aria-label={dict.historyGroupAria} className="flex gap-1">
          <button
            type="button"
            className={styles.mobileIconButton}
            disabled={!canUndo}
            aria-label={dict.undoAria}
            onClick={onUndo}
          >
            <Undo2 className="size-[17px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.mobileIconButton}
            disabled={!canRedo}
            aria-label={dict.redoAria}
            onClick={onRedo}
          >
            <Redo2 className="size-[17px]" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          className={styles.mobileSavePill}
          data-state={saveState}
          onClick={onExplicitSave}
          aria-label={fmt(dict.saveActionAria, {
            state: saveError ?? saveStateLabel(saveState),
          })}
        >
          <span className={styles.saveStateDot} aria-hidden="true">
            {saveState === "saving" ? (
              <LoaderCircle className="size-3 animate-spin" />
            ) : saveState === "error" ? (
              <span>!</span>
            ) : (
              <Check className="size-3" />
            )}
          </span>
          <span role="status">{saveStateLabel(saveState)}</span>
        </button>
        <div className={styles.topSpacer} />
        <button
          type="button"
          className={`${styles.actionButton} ${styles.publishButton} ${styles.mobilePublishButton}`}
          onClick={onOpenPublish}
        >
          <Send className="mr-1.5 inline size-4" aria-hidden="true" />
          {dict.publishAction}
        </button>
      </header>

      <div className={styles.mobileCanvas} onPointerDown={handleCanvasPointerDown}>
        <div className={styles.mobileCanvasCard} data-editor-preview="true">
          <div className={styles.mobileCanvasScroll}>
            <InteractiveVenuePreviewPage
              data={data}
              document={document}
              selection={selection}
              onSelectBlock={onSelectBlock}
              onSelectPage={onSelectPage}
              onReorder={onReorder}
            />
          </div>
        </div>
      </div>

      <nav className={styles.mobileDock} aria-label={dict.toolsAria}>
        <div ref={dockScrollerRef} className={styles.mobileDockScroller}>
          {primaryToolItems.map((item) => (
            <MobileDockButton
              key={item.id}
              item={item}
              active={activePanel === item.id}
              onClick={() => onPanelSelect(item.id)}
            />
          ))}
          <span className={styles.mobileDockDivider} aria-hidden="true" />
          {secondaryToolItems.map((item) => (
            <MobileDockButton
              key={item.id}
              item={item}
              active={activePanel === item.id}
              onClick={() => onPanelSelect(item.id)}
            />
          ))}
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {activePanel ? (
          <MobileSheet
            key="mobile-sheet"
            panel={activePanel}
            onClose={onClosePanel}
            reducedMotion={Boolean(reducedMotion)}
          >
            {panelContent}
          </MobileSheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MobileDockButton({
  item,
  active,
  onClick,
}: {
  item: VenueEditorToolItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={styles.mobileDockButton}
      data-tool-id={item.id}
      aria-pressed={active}
      aria-label={item.label}
      onClick={onClick}
    >
      {active ? (
        <motion.span
          className={styles.mobileDockActiveSurface}
          layoutId="venue-mobile-dock-active"
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 430, damping: 34 }}
        />
      ) : null}
      <Icon className="size-[19px]" strokeWidth={1.7} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

function MobileSheet({
  panel,
  onClose,
  reducedMotion,
  children,
}: {
  panel: VenueEditorPanelId;
  onClose: () => void;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const dragControls = useDragControls();
  const headingId = useId();
  const copy = panelCopy[panel];

  function startSheetDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (reducedMotion) return;
    const target = event.target;
    if (target instanceof Element && target.closest("button")) return;
    dragControls.start(event);
  }

  return (
    <motion.section
      className={styles.mobileSheet}
      role="dialog"
      aria-modal={false}
      aria-labelledby={headingId}
      initial={reducedMotion ? { opacity: 0 } : { y: "112%" }}
      animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { y: "112%" }}
      transition={
        reducedMotion
          ? { duration: 0.12 }
          : { type: "spring", stiffness: 400, damping: 41 }
      }
      drag={reducedMotion ? false : "y"}
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.015, bottom: 0.55 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 130 || info.velocity.y > 640) onClose();
      }}
    >
      <div
        className={styles.mobileSheetHandleZone}
        onPointerDown={startSheetDrag}
      >
        <span className={styles.mobileSheetGrabber} aria-hidden="true" />
      </div>
      <header className={styles.mobileSheetHeader} onPointerDown={startSheetDrag}>
        <div className={styles.mobileSheetHeading}>
          <h2 id={headingId} className={styles.mobileSheetTitle}>
            {copy.title}
          </h2>
          <p className={styles.mobileSheetDescription}>{copy.description}</p>
        </div>
        <button
          type="button"
          className={styles.mobileSheetClose}
          aria-label={dict.closePanelAria}
          onClick={onClose}
        >
          <X className="size-[17px]" aria-hidden="true" />
        </button>
      </header>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={panel}
          className={styles.mobileSheetBody}
          initial={reducedMotion ? false : { opacity: 0, y: 5, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -3 }}
          transition={{
            duration: reducedMotion ? 0.01 : 0.2,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className={styles.mobileSheetScroll}>{children}</div>
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}
