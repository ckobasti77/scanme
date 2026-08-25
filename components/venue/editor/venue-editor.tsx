"use client";

// The standalone Venue editor (TASK-10). Its own shell, history, autosave and
// publish loop — deliberately NOT a parameterization of the frozen Links
// editor (RFC-001 §2.5 TASK-06 amendment: recorded debt, unified later behind
// the risk-#1 E2E smoke). The autosave loop follows the Links shape exactly:
// content-hash diff + 720ms debounce, every draft write through saveDraft
// (which normalizes and clamps server-side), save state shown honestly as
// saving / saved / failed-with-retry. Publish goes through publishDraft with
// `expectedDraftRevision`; a revision mismatch surfaces as a "someone else
// changed this draft" dialog offering a reload — never a silent overwrite.

import { ConvexError } from "convex/values";
import { arrayMove } from "@dnd-kit/sortable";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useMutation,
  useQuery,
} from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { LoaderCircle, Redo2, Save, Send, Undo2 } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/brand-logo";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import {
  defaults,
  MAX_BLOCKS,
  type VenueBlock,
  type VenueBlockType,
} from "@/lib/venue-blocks";
import { VENUE_BLOCK_REGISTRY } from "@/components/venue/blocks/registry";
import { VenueEditorBlocksPanel } from "./venue-editor-blocks-panel";
import {
  panelCopy,
  primaryToolItems,
  SaveStatus,
  secondaryToolItems,
  toolItemFor,
  useCompactVenueEditor,
  VenueEditorBackdrop,
  VenueEditorStaticPanelContent,
  type VenueEditorToolItem,
} from "./venue-editor-common";
import { VenueEditorMobileShell } from "./venue-editor-mobile";
import { VenueEditorPreview } from "./venue-editor-preview";
import { useVenueEditorHistory } from "./use-venue-editor-history";
import styles from "./venue-editor.module.css";
import {
  documentBlocksToArg,
  draftBlocksToDocument,
  stableStringify,
  type VenueEditorData,
  type VenueEditorDocument,
  type VenueEditorPanelId,
  type VenueEditorSaveState,
  type VenueEditorSelection,
  type VenuePreviewDevice,
} from "./venue-editor-types";

export function VenueEditorScreen({ slug }: { slug: string }) {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <main className={styles.centerScreen}>
          <section className={styles.centerCard}>
            <h1 className={styles.centerTitle}>{dict.signInTitle}</h1>
            <p className={styles.centerBody}>{dict.signInBody}</p>
            <Link
              href={`/${encodeURIComponent(slug)}/client-panel`}
              className={styles.centerAction}
            >
              {dict.signInAction}
            </Link>
          </section>
        </main>
      </Unauthenticated>
      <Authenticated>
        <VenueEditorLoader slug={slug} />
      </Authenticated>
    </>
  );
}

function LoadingScreen() {
  return (
    <main className={styles.centerScreen}>
      <div className={styles.loadingState}>
        <LoaderCircle className="size-7 animate-spin" aria-hidden="true" />
        {dict.editorLoading}
      </div>
    </main>
  );
}

function VenueEditorLoader({ slug }: { slug: string }) {
  const data = useQuery(api.venue.editorBySlug, { slug });

  if (data === undefined) return <LoadingScreen />;

  if (data === null) {
    return (
      <main className={styles.centerScreen}>
        <section className={styles.centerCard}>
          <h1 className={styles.centerTitle}>{dict.unavailableTitle}</h1>
          <p className={styles.centerBody}>{dict.unavailableBody}</p>
        </section>
      </main>
    );
  }

  if (!data.event) {
    return (
      <main className={styles.centerScreen}>
        <section className={styles.centerCard}>
          <h1 className={styles.centerTitle}>{dict.noEventTitle}</h1>
          <p className={styles.centerBody}>{dict.noEventBody}</p>
        </section>
      </main>
    );
  }

  return <VenueEditorWorkspace key={data.event.id} data={data} />;
}

function documentHash(document: VenueEditorDocument) {
  return stableStringify(document.blocks);
}

// Content check for the delete confirmation: a block whose props still equal
// its type's defaults is "empty" and deletes silently; anything else asks.
// (Undo covers both paths either way.)
function blockHasContent(block: VenueBlock) {
  return (
    stableStringify(block.props) !==
    stableStringify(defaults(block.type).props)
  );
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function VenueEditorWorkspace({ data }: { data: VenueEditorData }) {
  const event = data.event!;
  const reducedMotion = useReducedMotion();
  const compactEditor = useCompactVenueEditor();

  const initialDocument = useMemo<VenueEditorDocument>(
    () => ({ blocks: draftBlocksToDocument(event.draftBlocks) }),
    // The workspace is keyed by event id; the initial document is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const history = useVenueEditorHistory(initialDocument);
  const document = history.value;

  const [saveState, setSaveState] = useState<VenueEditorSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<VenueEditorPanelId | null>(
    null,
  );
  const [selection, setSelection] = useState<VenueEditorSelection>(null);
  // MOBILE PREVIEW IS THE DEFAULT VIEW — visitors arrive by phone-scanned QR.
  const [device, setDevice] = useState<VenuePreviewDevice>("phone");
  const [zoom, setZoom] = useState(100);
  const [deleteTarget, setDeleteTarget] = useState<VenueBlock | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);

  const currentDocumentRef = useRef(document);
  const persistedHashRef = useRef(documentHash(initialDocument));
  const latestRevisionRef = useRef(event.draftRevision);
  const saveRequestRef = useRef(0);

  const saveDraft = useMutation(api.venue.saveDraft);
  const publishDraft = useMutation(api.venue.publishDraft);

  const currentHash = useMemo(() => documentHash(document), [document]);

  useEffect(() => {
    currentDocumentRef.current = document;
  }, [document]);

  const setDocument = useCallback(
    (
      next:
        | VenueEditorDocument
        | ((current: VenueEditorDocument) => VenueEditorDocument),
      group?: string,
    ) => {
      setSaveState("saving");
      history.set(next, group);
    },
    [history],
  );

  const persistDocument = useCallback(
    async (target: VenueEditorDocument, options?: { force?: boolean }) => {
      const hash = documentHash(target);
      if (!options?.force && hash === persistedHashRef.current) {
        return { draftRevision: latestRevisionRef.current };
      }

      const requestId = ++saveRequestRef.current;
      setSaveState("saving");
      setSaveError(null);
      try {
        const result = await saveDraft({
          eventId: event.id,
          blocks: documentBlocksToArg(target.blocks),
        });
        persistedHashRef.current = hash;
        latestRevisionRef.current = result.draftRevision;
        if (requestId === saveRequestRef.current) {
          setSaveState(
            documentHash(currentDocumentRef.current) === hash
              ? "saved"
              : "saving",
          );
        }
        return result;
      } catch (error) {
        const message = errorMessage(error, dict.saveErrorFallback);
        if (requestId === saveRequestRef.current) {
          setSaveState("error");
          setSaveError(message);
        }
        throw error;
      }
    },
    [event.id, saveDraft],
  );

  // The autosave loop: content-hash diff + debounce (the Links shape).
  useEffect(() => {
    if (currentHash === persistedHashRef.current) {
      const settledTimer = window.setTimeout(() => {
        setSaveState((current) => (current === "error" ? current : "saved"));
      }, 0);
      return () => window.clearTimeout(settledTimer);
    }
    const timer = window.setTimeout(() => {
      void persistDocument(document).catch(() => {
        // The visible failed-with-retry state carries the error; explicit
        // actions additionally toast it.
      });
    }, 720);
    return () => window.clearTimeout(timer);
  }, [currentHash, document, persistDocument]);

  const dialogOpen = publishOpen || conflictOpen || deleteTarget !== null;

  useEffect(() => {
    function handleKeyboard(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === "Escape" && !dialogOpen) {
        setSelection(null);
        setActivePanel(null);
        return;
      }
      if (
        !(keyboardEvent.ctrlKey || keyboardEvent.metaKey) ||
        keyboardEvent.key.toLowerCase() !== "z"
      ) {
        return;
      }
      if (!window.document.hasFocus()) return;
      keyboardEvent.preventDefault();
      setSaveState("saving");
      if (keyboardEvent.shiftKey) history.redo();
      else history.undo();
    }

    window.addEventListener("keydown", handleKeyboard);
    return () => window.removeEventListener("keydown", handleKeyboard);
  }, [dialogOpen, history]);

  async function handleExplicitSave() {
    try {
      await persistDocument(currentDocumentRef.current, {
        force: currentHash !== persistedHashRef.current,
      });
      toast.success(dict.savedToast);
    } catch (error) {
      toast.error(errorMessage(error, dict.saveErrorFallback));
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      const saveResult = await persistDocument(currentDocumentRef.current);
      await publishDraft({
        eventId: event.id,
        expectedDraftRevision: saveResult.draftRevision,
      });
      setPublishOpen(false);
      toast.success(dict.publishSuccess);
    } catch (error) {
      // A revision mismatch means someone else changed or published this
      // draft: name it and offer a reload instead of silently overwriting.
      if (error instanceof ConvexError && error.data === dict.draftChanged) {
        setPublishOpen(false);
        setConflictOpen(true);
      } else {
        toast.error(errorMessage(error, dict.publishErrorFallback));
      }
    } finally {
      setPublishing(false);
    }
  }

  function handleUndo() {
    setSaveState("saving");
    history.undo();
  }

  function handleRedo() {
    setSaveState("saving");
    history.redo();
  }

  function handleSelectBlock(id: string) {
    setSelection({ kind: "block", id });
    setActivePanel("blocks");
  }

  function handleSelectPage() {
    setSelection({ kind: "page" });
  }

  function handlePanelSelect(panel: VenueEditorPanelId) {
    const nextPanel = activePanel === panel ? null : panel;
    if (nextPanel !== "blocks" && selection?.kind === "block") {
      setSelection(null);
    }
    setActivePanel(nextPanel);
  }

  function closeActivePanel() {
    if (selection?.kind === "block") setSelection(null);
    setActivePanel(null);
  }

  function handleAddBlock(type: VenueBlockType) {
    // The cap is enforced in the UI before the server would reject: the add
    // tiles disable at MAX_BLOCKS with a written reason; this guard only backs
    // that up against races.
    if (currentDocumentRef.current.blocks.length >= MAX_BLOCKS) return;
    const block = defaults(type);
    block.base.id = crypto.randomUUID();
    setDocument((current) => ({
      ...current,
      blocks: [...current.blocks, block],
    }));
    setSelection({ kind: "block", id: block.base.id });
    setActivePanel("blocks");
  }

  function handleDuplicateBlock(id: string) {
    if (currentDocumentRef.current.blocks.length >= MAX_BLOCKS) return;
    setDocument((current) => {
      const index = current.blocks.findIndex(
        (block) => block.base.id === id,
      );
      if (index < 0) return current;
      const source = current.blocks[index];
      const copy: VenueBlock = structuredClone(source);
      copy.base.id = crypto.randomUUID();
      const blocks = [...current.blocks];
      blocks.splice(index + 1, 0, copy);
      return { ...current, blocks };
    });
  }

  function handleReorder(activeId: string, overId: string) {
    setDocument((current) => {
      const oldIndex = current.blocks.findIndex(
        (block) => block.base.id === activeId,
      );
      const newIndex = current.blocks.findIndex(
        (block) => block.base.id === overId,
      );
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return current;
      }
      return { ...current, blocks: arrayMove(current.blocks, oldIndex, newIndex) };
    });
  }

  function deleteBlock(id: string) {
    setDocument((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.base.id !== id),
    }));
    setSelection((current) =>
      current?.kind === "block" && current.id === id ? null : current,
    );
    toast.success(dict.blockDeletedToast);
  }

  // Delete asks for confirmation only when the block has content; an empty
  // block deletes silently. Undo covers both.
  function handleRequestDeleteBlock(block: VenueBlock) {
    if (blockHasContent(block)) {
      setDeleteTarget(block);
    } else {
      deleteBlock(block.base.id);
    }
  }

  function confirmDeleteBlock() {
    if (!deleteTarget) return;
    deleteBlock(deleteTarget.base.id);
    setDeleteTarget(null);
  }

  function handleChangeBlock(next: VenueBlock, group?: string) {
    // The registry EditorPanel contract (TASK-11 consumes it; nothing calls it
    // in TASK-10 because no panel is filled yet).
    setDocument(
      (current) => ({
        ...current,
        blocks: current.blocks.map((block) =>
          block.base.id === next.base.id ? next : block,
        ),
      }),
      group,
    );
  }

  function handleWorkspacePointerDown(
    pointerEvent: ReactPointerEvent<HTMLDivElement>,
  ) {
    const target = pointerEvent.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest(
        "[data-slot='select-content'],[data-radix-popper-content-wrapper]",
      )
    ) {
      return;
    }
    if (target.closest("[data-context-panel='true']")) return;
    if (target.closest("[data-rail='true']")) return;
    if (target.closest("[data-editor-preview='true']")) return;
    if (
      target.closest(
        "button,a,input,textarea,select,[role='button'],[role='combobox'],[data-editor-preserve-panel='true']",
      )
    ) {
      return;
    }
    setSelection(null);
    setActivePanel(null);
  }

  function renderPanelContent(panel: VenueEditorPanelId): ReactNode {
    if (panel === "blocks") {
      return (
        <VenueEditorBlocksPanel
          document={document}
          selection={selection}
          onSelectBlock={handleSelectBlock}
          onClearSelection={() => setSelection(null)}
          onReorder={handleReorder}
          onAddBlock={handleAddBlock}
          onDuplicateBlock={handleDuplicateBlock}
          onRequestDeleteBlock={handleRequestDeleteBlock}
          onChangeBlock={handleChangeBlock}
        />
      );
    }
    return <VenueEditorStaticPanelContent panel={panel} data={data} />;
  }

  return (
    <div className={styles.editorRoot}>
      {compactEditor ? (
        <VenueEditorMobileShell
          data={data}
          document={document}
          saveState={saveState}
          saveError={saveError}
          canUndo={history.canUndo}
          canRedo={history.canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onExplicitSave={() => void handleExplicitSave()}
          onOpenPublish={() => setPublishOpen(true)}
          activePanel={activePanel}
          onPanelSelect={handlePanelSelect}
          onClosePanel={closeActivePanel}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          onSelectBlock={handleSelectBlock}
          onSelectPage={handleSelectPage}
          onReorder={handleReorder}
          panelContent={activePanel ? renderPanelContent(activePanel) : null}
        />
      ) : (
        <div className={styles.desktopEditor}>
          <VenueEditorBackdrop />

          <header className={styles.topBar} data-editor-preserve-panel="true">
            <Link className={styles.brandLink} href="/admin/venue">
              <BrandLogo width="6.6rem" />
              <span className="sr-only">{dict.backAria}</span>
            </Link>
            <div className={styles.topTitleGroup}>
              <p className={styles.topTitle}>{event.title}</p>
              <p className={styles.topSubtitle}>
                /{data.businessSlug}/venue/{event.slug}
              </p>
            </div>
            <SaveStatus
              state={saveState}
              error={saveError}
              onRetry={() => void handleExplicitSave()}
            />
            <div className={styles.topSpacer} />
            <div
              className={styles.utilityGroup}
              aria-label={dict.historyGroupAria}
            >
              <button
                className={styles.iconButton}
                type="button"
                disabled={!history.canUndo}
                aria-label={dict.undoAria}
                title={dict.undoTooltip}
                onClick={handleUndo}
              >
                <Undo2 className="size-[17px]" aria-hidden="true" />
              </button>
              <button
                className={styles.iconButton}
                type="button"
                disabled={!history.canRedo}
                aria-label={dict.redoAria}
                title={dict.redoTooltip}
                onClick={handleRedo}
              >
                <Redo2 className="size-[17px]" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void handleExplicitSave()}
            >
              <Save className="mr-2 inline size-4" aria-hidden="true" />
              {dict.saveDraftAction}
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.publishButton}`}
              onClick={() => setPublishOpen(true)}
            >
              <Send className="mr-2 inline size-4" aria-hidden="true" />
              {dict.publishAction}
            </button>
          </header>

          <div
            className={styles.workspace}
            onPointerDown={handleWorkspacePointerDown}
          >
            <nav
              className={styles.railStack}
              data-rail="true"
              aria-label={dict.toolsAria}
            >
              <div className={styles.rail}>
                {primaryToolItems.map((item) => (
                  <RailButton
                    key={item.id}
                    item={item}
                    active={activePanel === item.id}
                    activeSurfaceId="venue-rail-active-primary"
                    onClick={() => handlePanelSelect(item.id)}
                  />
                ))}
              </div>
              <div className={styles.rail}>
                {secondaryToolItems.map((item) => (
                  <RailButton
                    key={item.id}
                    item={item}
                    active={activePanel === item.id}
                    activeSurfaceId="venue-rail-active-secondary"
                    onClick={() => handlePanelSelect(item.id)}
                  />
                ))}
              </div>
            </nav>

            <div className={styles.contextSlot}>
              <AnimatePresence initial={false}>
                {activePanel ? (
                  <motion.aside
                    key="context-panel"
                    className={styles.contextPanel}
                    data-context-panel="true"
                    initial={
                      reducedMotion
                        ? false
                        : {
                            opacity: 0,
                            clipPath: "inset(0 100% 0 0 round 28px)",
                          }
                    }
                    animate={{
                      opacity: 1,
                      clipPath: "inset(0 0% 0 0 round 28px)",
                    }}
                    exit={
                      reducedMotion
                        ? { opacity: 0 }
                        : {
                            opacity: 0,
                            clipPath: "inset(0 100% 0 0 round 28px)",
                          }
                    }
                    transition={{
                      duration: reducedMotion ? 0.01 : 0.3,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  >
                    <div className={styles.panelScroll}>
                      {(() => {
                        const item = toolItemFor(activePanel);
                        const Icon = item.icon;
                        const copy = panelCopy[activePanel];
                        return (
                          <>
                            <header className={styles.panelHeader}>
                              <span
                                className={styles.panelBadge}
                                aria-hidden="true"
                              >
                                <Icon
                                  className="size-[18px]"
                                  strokeWidth={1.7}
                                />
                              </span>
                              <div className={styles.panelHeading}>
                                <h2 className={styles.panelTitle}>
                                  {copy.title}
                                </h2>
                                <p className={styles.panelDescription}>
                                  {copy.description}
                                </p>
                              </div>
                            </header>
                            {renderPanelContent(activePanel)}
                          </>
                        );
                      })()}
                    </div>
                  </motion.aside>
                ) : null}
              </AnimatePresence>
            </div>

            <VenueEditorPreview
              data={data}
              document={document}
              selection={selection}
              onSelectBlock={handleSelectBlock}
              onSelectPage={handleSelectPage}
              onReorder={handleReorder}
              device={device}
              setDevice={setDevice}
              zoom={zoom}
              setZoom={setZoom}
            />
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTarget
                ? fmt(dict.deleteDialogTitle, {
                    block: VENUE_BLOCK_REGISTRY[deleteTarget.type].label,
                  })
                : null}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {dict.deleteDialogBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className={styles.actionButton} type="button">
                {dict.deleteCancel}
              </button>
            </DialogClose>
            <button
              className={styles.dangerButton}
              type="button"
              onClick={confirmDeleteBlock}
            >
              {dict.deleteConfirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.publishDialogTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {dict.publishDialogBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className={styles.actionButton} type="button">
                {dict.publishCancel}
              </button>
            </DialogClose>
            <button
              className={`${styles.actionButton} ${styles.publishButton}`}
              type="button"
              disabled={publishing}
              onClick={() => void handlePublish()}
            >
              {publishing ? (
                <LoaderCircle className="mr-2 inline size-4 animate-spin" />
              ) : (
                <Send className="mr-2 inline size-4" />
              )}
              {dict.publishConfirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.publishConflictTitle}</DialogTitle>
            <DialogDescription className="leading-6">
              {dict.publishConflictBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              className={`${styles.actionButton} ${styles.publishButton}`}
              type="button"
              onClick={() => window.location.reload()}
            >
              {dict.publishConflictReload}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RailButton({
  item,
  active,
  activeSurfaceId,
  onClick,
}: {
  item: VenueEditorToolItem;
  active: boolean;
  activeSurfaceId: string;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={styles.railButton}
      aria-pressed={active}
      aria-label={item.label}
      onClick={onClick}
    >
      {active ? (
        <motion.span
          className={styles.railActiveSurface}
          layoutId={activeSurfaceId}
          initial={{ opacity: 0, scale: 0.82 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 430, damping: 34 }}
        />
      ) : null}
      <Icon className="size-[20px]" strokeWidth={1.7} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}
