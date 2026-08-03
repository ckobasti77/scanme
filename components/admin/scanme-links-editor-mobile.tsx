"use client";

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
} from "react";
import { ScanMeContrastAssistant } from "@/components/admin/scanme-contrast-assistant";
import type { ContrastSuggestion } from "@/lib/scanme-contrast";
import { cn } from "@/lib/utils";
import {
  EditorBackdrop,
  EditorPanelContent,
  panelCopy,
  primaryToolItems,
  visibleSecondaryToolItems,
  type EditorToolItem,
} from "./scanme-links-editor-common";
import {
  InteractivePreviewPage,
  useEditorPreviewModel,
} from "./scanme-links-editor-preview";
import styles from "./scanme-links-editor.module.css";
import type {
  EditorData,
  EditorDestination,
  EditorDocumentSetter,
  EditorPanelId,
  EditorSaveState,
  ScanMeLinksEditorDocument,
} from "./scanme-links-editor-types";

export type MobileEditorShellProps = {
  data: EditorData;
  document: ScanMeLinksEditorDocument;
  setDocument: EditorDocumentSetter;
  saveState: EditorSaveState;
  saveError: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExplicitSave: () => void;
  onOpenPublish: () => void;
  activePanel: EditorPanelId | null;
  onPanelSelect: (panel: EditorPanelId) => void;
  onClosePanel: () => void;
  selectedDestination: EditorDestination | null;
  selectedDestinationId: string | null;
  onSelectDestination: (destinationId: EditorDestination["id"]) => void;
  onClearSelection: () => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddDestination: () => void;
  addBusy: boolean;
  uploadLogo: (file: File) => Promise<void>;
  uploadBackground: (kind: "image" | "video", file: File) => Promise<void>;
  uploadBusy: boolean;
  setDeleteTarget: (destination: EditorDestination) => void;
  settingsBusy: boolean;
  saveBusinessIdentity: (name: string, slug: string) => Promise<void>;
  togglePublic: (active: boolean) => Promise<void>;
  onApplyContrastSuggestion: (suggestion: ContrastSuggestion) => void;
};

const saveStateLabels: Record<EditorSaveState, string> = {
  saved: "Sačuvano",
  saving: "Čuvanje…",
  error: "Nije sačuvano",
};

export function MobileEditorShell({
  data,
  document,
  setDocument,
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
  selectedDestination,
  selectedDestinationId,
  onSelectDestination,
  onClearSelection,
  onReorder,
  onAddDestination,
  addBusy,
  uploadLogo,
  uploadBackground,
  uploadBusy,
  setDeleteTarget,
  settingsBusy,
  saveBusinessIdentity,
  togglePublic,
  onApplyContrastSuggestion,
}: MobileEditorShellProps) {
  const reducedMotion = useReducedMotion();
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const dockScrollerRef = useRef<HTMLDivElement>(null);
  const { view, destinations, contrastIssues } =
    useEditorPreviewModel(document);

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
    if (target.closest("[data-editor-destination='true']")) return;
    if (
      target.closest("button,a,input,textarea,select,[role='button']")
    ) {
      return;
    }
    // Dodir po praznom delu stranice: kao klik na radnu površinu na desktopu —
    // skida selekciju i spušta otvoreni panel da se preview vidi ceo.
    onClearSelection();
    if (activePanel) onClosePanel();
  }

  return (
    <div className={styles.mobileEditor}>
      <EditorBackdrop />

      <header className={styles.mobileTopBar}>
        <Link
          className={styles.mobileIconButton}
          href="/admin/scanme-links"
          aria-label="Nazad na ScanMe Links admin panel"
        >
          <ChevronLeft className="size-[19px]" aria-hidden="true" />
        </Link>
        <div className={styles.mobileHistoryGroup} aria-label="Istorija izmena">
          <button
            type="button"
            className={styles.mobileIconButton}
            disabled={!canUndo}
            aria-label="Vrati prethodnu izmenu"
            onClick={onUndo}
          >
            <Undo2 className="size-[17px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.mobileIconButton}
            disabled={!canRedo}
            aria-label="Ponovi izmenu"
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
          aria-label={
            saveState === "error"
              ? `Sačuvaj nacrt (${saveError ?? "greška pri čuvanju"})`
              : `Sačuvaj nacrt (trenutno: ${saveStateLabels[saveState]})`
          }
        >
          <span className={styles.saveStateDot}>
            {saveState === "saving" ? (
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
            ) : saveState === "error" ? (
              <span aria-hidden="true">!</span>
            ) : (
              <Check className="size-3" aria-hidden="true" />
            )}
          </span>
          <span className={styles.mobileSaveLabel} role="status">
            {saveStateLabels[saveState]}
          </span>
        </button>
        <div className={styles.topSpacer} />
        <button
          type="button"
          className={cn(
            styles.topAction,
            styles.publishButton,
            styles.mobilePublishButton,
          )}
          onClick={onOpenPublish}
        >
          <Send className="mr-1.5 inline size-4" aria-hidden="true" />
          Objavi
        </button>
      </header>

      <div
        ref={canvasAreaRef}
        className={styles.mobileCanvas}
        onPointerDown={handleCanvasPointerDown}
      >
        <div className={styles.mobileCanvasCard} data-editor-preview="true">
          <div className={styles.mobileCanvasScroll}>
            <InteractivePreviewPage
              view={view}
              destinations={destinations}
              selectedDestinationId={selectedDestinationId}
              onSelectDestination={onSelectDestination}
              onReorder={onReorder}
              onAddDestination={onAddDestination}
              addBusy={addBusy}
            />
          </div>
        </div>
        {/*
          device="desktop" namerno: "phone" grana pozicionira kartice levo ili
          desno OD preview okvira, a na mobilnom preview zauzima celu širinu,
          pa bi kartice završile van ekrana. Desktop grana ih slaže unutar
          kontejnera, preklopljene preko vrha kartice pregleda.
        */}
        <ScanMeContrastAssistant
          issues={contrastIssues}
          device="desktop"
          containerRef={canvasAreaRef}
          onApply={onApplyContrastSuggestion}
        />
      </div>

      <MobileDock
        activePanel={activePanel}
        onSelect={onPanelSelect}
        scrollerRef={dockScrollerRef}
        editorRole={data.editorRole}
      />

      <AnimatePresence initial={false}>
        {activePanel ? (
          <MobileSheet
            key="mobile-sheet"
            panel={activePanel}
            onClose={onClosePanel}
            reducedMotion={Boolean(reducedMotion)}
          >
            <EditorPanelContent
              panel={activePanel}
              data={data}
              document={document}
              setDocument={setDocument}
              selectedDestination={selectedDestination}
              uploadLogo={uploadLogo}
              uploadBackground={uploadBackground}
              uploadBusy={uploadBusy}
              setDeleteTarget={setDeleteTarget}
              settingsBusy={settingsBusy}
              saveBusinessIdentity={saveBusinessIdentity}
              togglePublic={togglePublic}
            />
          </MobileSheet>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MobileDock({
  activePanel,
  onSelect,
  scrollerRef,
  editorRole,
}: {
  activePanel: EditorPanelId | null;
  onSelect: (panel: EditorPanelId) => void;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  editorRole: EditorData["editorRole"];
}) {
  return (
    <nav className={styles.mobileDock} aria-label="Alati editora">
      <div ref={scrollerRef} className={styles.mobileDockScroller}>
        {primaryToolItems.map((item) => (
          <MobileDockButton
            key={item.id}
            item={item}
            active={activePanel === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
        <span className={styles.mobileDockDivider} aria-hidden="true" />
        {visibleSecondaryToolItems(editorRole).map((item) => (
          <MobileDockButton
            key={item.id}
            item={item}
            active={activePanel === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>
    </nav>
  );
}

function MobileDockButton({
  item,
  active,
  onClick,
}: {
  item: EditorToolItem;
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
          layoutId="mobile-dock-active"
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
  panel: EditorPanelId;
  onClose: () => void;
  reducedMotion: boolean;
  children: React.ReactNode;
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
      <header
        className={styles.mobileSheetHeader}
        onPointerDown={startSheetDrag}
      >
        <div className={styles.mobileSheetHeading}>
          <h2 id={headingId} className={styles.mobileSheetTitle}>
            {copy.title}
          </h2>
          <p className={styles.mobileSheetDescription}>{copy.description}</p>
        </div>
        <button
          type="button"
          className={styles.mobileSheetClose}
          aria-label="Zatvori panel"
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
          <div className={styles.mobileSheetScroll} data-panel-scroll="true">
            {children}
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.section>
  );
}
