"use client";

// The standalone Menu editor (RFC-003 §1.a, §4 TASK-51). FORKED from
// components/venue/editor/venue-editor.tsx — the shipped Venue shell, copied
// into new files on a new route, never a parameterization of Venue and never
// a touch of the frozen Links editor. Its own shell, autosave and publish
// loop; the product-agnostic history hook is SHARED
// (components/admin/use-editor-history.ts), as the task prescribes.
//
// The autosave loop follows the Venue shape exactly: content-hash diff +
// 720 ms debounce, every draft write through saveDraft (which normalizes and
// clamps server-side), save state shown honestly as saving / saved /
// failed-with-retry. Publish goes through publishDraft with
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
import { useEditorHistory } from "@/components/admin/use-editor-history";
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
import { clampMenuDesign } from "@/lib/design-engine/menu-tokens";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import {
  isAvailabilityConflict,
  type AvailabilityConflictMode,
} from "@/lib/menu-publish";
import {
  defaults,
  type MenuGroup,
  type MenuGroupShape,
} from "@/lib/menu-blocks";
import { MENU_GROUP_REGISTRY } from "@/components/menu/blocks/registry";
import {
  groupDisplayName,
  MenuEditorBackdrop,
  MenuEditorStaticPanelContent,
  panelCopy,
  primaryToolItems,
  SaveStatus,
  secondaryToolItems,
  toolItemFor,
  useCompactMenuEditor,
  type MenuEditorToolItem,
} from "./menu-editor-common";
import { MenuEditorGroupsPanel } from "./menu-editor-groups-panel";
import { MenuEditorMobileShell } from "./menu-editor-mobile";
import { MenuPagePanel } from "./menu-editor-page-panels";
import {
  MenuEditorPanelProvider,
  paletteSwatches,
  type MenuEditorPanelServices,
  type PairableItem,
} from "./menu-editor-panel-context";
import { MenuEditorPreview } from "./menu-editor-preview";
import { postFileWithProgress } from "./menu-editor-upload";
import styles from "./menu-editor.module.css";
import {
  documentToModelArg,
  draftToDocument,
  stableStringify,
  type MenuEditorData,
  type MenuEditorDocument,
  type MenuEditorPanelId,
  type MenuEditorSaveState,
  type MenuEditorSelection,
  type MenuPreviewDevice,
} from "./menu-editor-types";

export function MenuEditorScreen({ slug }: { slug: string }) {
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
        <MenuEditorLoader slug={slug} />
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

function MenuEditorLoader({ slug }: { slug: string }) {
  const data = useQuery(api.menu.editorBySlug, { slug });

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

  if (!data.menu) {
    return <CreateMenuScreen slug={slug} />;
  }

  return <MenuEditorWorkspace key={data.menu.id} data={data} />;
}

// A business with no menu yet: one explicit action creates the empty draft
// (the query re-renders into the workspace reactively).
function CreateMenuScreen({ slug }: { slug: string }) {
  const createMenu = useMutation(api.menu.createMenu);
  const [pending, setPending] = useState(false);

  async function handleCreate() {
    setPending(true);
    try {
      await createMenu({ slug });
    } catch (error) {
      toast.error(errorMessage(error, dict.createMenuErrorFallback));
      setPending(false);
    }
  }

  return (
    <main className={styles.centerScreen}>
      <section className={styles.centerCard}>
        <h1 className={styles.centerTitle}>{dict.noMenuTitle}</h1>
        <p className={styles.centerBody}>{dict.noMenuBody}</p>
        <button
          type="button"
          className={styles.centerAction}
          disabled={pending}
          onClick={() => void handleCreate()}
        >
          {pending ? (
            <LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {dict.createMenuAction}
        </button>
      </section>
    </main>
  );
}

function documentHash(document: MenuEditorDocument) {
  // The whole editable document — groups, dayparts, override, design — one
  // hash, one autosave loop, one history.
  return stableStringify(document);
}

// Content check for the delete confirmation: a group with items asks; an
// empty group deletes silently. (Undo covers both paths either way.)
function groupHasContent(group: MenuGroup) {
  return group.items.length > 0;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

// A duplicated group gets fresh ids everywhere (group, items, variants,
// pairings) so ids stay unique across the menu; a pairing that pointed INSIDE
// the copied group follows the copy, one that pointed elsewhere stays.
function cloneGroupWithFreshIds(source: MenuGroup): MenuGroup {
  const copy: MenuGroup = structuredClone(source);
  copy.base.id = crypto.randomUUID();
  const itemIdMap = new Map<string, string>();
  for (const item of copy.items) {
    const next = crypto.randomUUID();
    itemIdMap.set(item.id, next);
    item.id = next;
  }
  for (const item of copy.items) {
    item.variants = item.variants.map((variant) => ({
      ...variant,
      id: crypto.randomUUID(),
    }));
    item.pairings = item.pairings.map((pairing) => ({
      id: crypto.randomUUID(),
      pairedItemId: itemIdMap.get(pairing.pairedItemId) ?? pairing.pairedItemId,
    }));
  }
  return copy;
}

export function MenuEditorWorkspace({ data }: { data: MenuEditorData }) {
  const menu = data.menu!;
  const reducedMotion = useReducedMotion();
  const compactEditor = useCompactMenuEditor();

  const initialDocument = useMemo<MenuEditorDocument>(
    () => draftToDocument(menu),
    // The workspace is keyed by menu id; the initial document is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // The SHARED product-agnostic history primitive (the task's fork rule).
  const history = useEditorHistory(initialDocument);
  const document = history.value;

  const [saveState, setSaveState] = useState<MenuEditorSaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<MenuEditorPanelId | null>(
    null,
  );
  const [selection, setSelection] = useState<MenuEditorSelection>(null);
  // MOBILE PREVIEW IS THE DEFAULT VIEW — the guest scans a QR code at the table.
  const [device, setDevice] = useState<MenuPreviewDevice>("phone");
  const [zoom, setZoom] = useState(100);
  const [deleteTarget, setDeleteTarget] = useState<MenuGroup | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  // TASK-58 (RFC-003 §3 Risk 10): names of items the floor marked "nema više"
  // that this publish would resurrect; the server refused until told how.
  const [availabilityConflict, setAvailabilityConflict] = useState<
    string[] | null
  >(null);

  const currentDocumentRef = useRef(document);
  const persistedHashRef = useRef(documentHash(initialDocument));
  const latestRevisionRef = useRef(menu.draftRevision);
  const saveRequestRef = useRef(0);

  const saveDraft = useMutation(api.menu.saveDraft);
  const publishDraft = useMutation(api.menu.publishDraft);
  const generateUploadUrl = useMutation(api.menu.generateEditorUploadUrl);

  // Fresh-upload object URLs, overlaid on the editor query's signed URLs so a
  // just-uploaded photo previews instantly.
  const [localMediaUrls, setLocalMediaUrls] = useState<Record<string, string>>(
    {},
  );
  const registerLocalMedia = useCallback((storageId: string, url: string) => {
    setLocalMediaUrls((current) => ({ ...current, [storageId]: url }));
  }, []);
  const mediaUrls = useMemo(
    () => ({ ...menu.blockImageUrls, ...localMediaUrls }),
    [menu.blockImageUrls, localMediaUrls],
  );

  const currentHash = useMemo(() => documentHash(document), [document]);

  useEffect(() => {
    currentDocumentRef.current = document;
  }, [document]);

  const setDocument = useCallback(
    (
      next:
        | MenuEditorDocument
        | ((current: MenuEditorDocument) => MenuEditorDocument),
      group?: string,
    ) => {
      setSaveState("saving");
      history.set(next, group);
    },
    [history],
  );

  const persistDocument = useCallback(
    async (target: MenuEditorDocument, options?: { force?: boolean }) => {
      const hash = documentHash(target);
      if (!options?.force && hash === persistedHashRef.current) {
        return { draftRevision: latestRevisionRef.current };
      }

      const requestId = ++saveRequestRef.current;
      setSaveState("saving");
      setSaveError(null);
      try {
        const result = await saveDraft({
          menuId: menu.id,
          model: documentToModelArg(target),
          // A never-designed menu stays undesigned until a page panel edits
          // it; sending nothing keeps the stored value untouched.
          design: target.design
            ? (target.design as Parameters<typeof saveDraft>[0]["design"])
            : undefined,
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
    [menu.id, saveDraft],
  );

  // Panel services: the upload pipeline, the CURRENT page palette, the
  // daypart list and the pairable items, provided once so every panel stays
  // prop-free.
  const upload = useCallback(
    async (file: File, onProgress: (percent: number) => void) => {
      const uploadUrl = await generateUploadUrl({ menuId: menu.id });
      return postFileWithProgress(uploadUrl, file, onProgress);
    },
    [menu.id, generateUploadUrl],
  );
  const pairableItems = useMemo<PairableItem[]>(
    () =>
      document.groups.flatMap((group) =>
        group.items.map((item) => ({
          id: item.id,
          name: item.name,
          groupTitle: group.base.title.trim(),
        })),
      ),
    [document.groups],
  );
  const panelServices = useMemo<MenuEditorPanelServices>(
    () => ({
      menuId: menu.id,
      swatches: paletteSwatches(clampMenuDesign(document.design).colors),
      upload,
      mediaUrls,
      registerLocalMedia,
      dayparts: document.dayparts,
      pairableItems,
    }),
    [
      document.dayparts,
      document.design,
      menu.id,
      mediaUrls,
      pairableItems,
      registerLocalMedia,
      upload,
    ],
  );

  // The autosave loop: content-hash diff + debounce (the Venue shape).
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

  async function handlePublish(onAvailabilityConflict?: AvailabilityConflictMode) {
    setPublishing(true);
    try {
      const saveResult = await persistDocument(currentDocumentRef.current);
      const result = await publishDraft({
        menuId: menu.id,
        expectedDraftRevision: saveResult.draftRevision,
        onAvailabilityConflict,
      });
      if (result.keptUnavailable.length > 0) {
        // keepLive: the server published — and mirrored into the stored
        // draft — those items as unavailable. Reflect that here and mark it
        // persisted, so no autosave re-sends the stale `true`.
        const keys = new Set(result.keptUnavailable.map((item) => item.key));
        const current = currentDocumentRef.current;
        const next: MenuEditorDocument = {
          ...current,
          groups: current.groups.map((group) => ({
            ...group,
            items: group.items.map((item) =>
              keys.has(item.id) ? { ...item, available: false } : item,
            ),
          })),
        };
        persistedHashRef.current = documentHash(next);
        currentDocumentRef.current = next;
        history.set(next, "availability");
      }
      setPublishOpen(false);
      setAvailabilityConflict(null);
      toast.success(dict.publishSuccess);
    } catch (error) {
      // A revision mismatch means someone else changed or published this
      // draft: name it and offer a reload instead of silently overwriting.
      if (error instanceof ConvexError && error.data === dict.draftChanged) {
        setPublishOpen(false);
        setConflictOpen(true);
      } else if (
        error instanceof ConvexError &&
        isAvailabilityConflict(error.data)
      ) {
        // The floor marked "nema više" while this draft was open (TASK-58):
        // the owner decides — keep the live state, or overwrite it knowingly.
        setPublishOpen(false);
        setAvailabilityConflict(error.data.items.map((item) => item.name));
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

  function handleSelectGroup(id: string) {
    setSelection({ kind: "group", id });
    setActivePanel("groups");
  }

  // Selecting the page (template chrome in the preview) opens the page's own
  // panels; an already-open page panel is kept, otherwise style leads.
  function handleSelectPage() {
    setSelection({ kind: "page" });
    setActivePanel((current) =>
      current && current !== "groups" && current !== "help" ? current : "style",
    );
  }

  function handlePanelSelect(panel: MenuEditorPanelId) {
    const nextPanel = activePanel === panel ? null : panel;
    if (nextPanel !== "groups" && selection?.kind === "group") {
      setSelection(null);
    }
    setActivePanel(nextPanel);
  }

  function closeActivePanel() {
    if (selection?.kind === "group") setSelection(null);
    setActivePanel(null);
  }

  function handleAddGroup(shape: MenuGroupShape) {
    // Groups are UNLIMITED (RFC-003 §2.7): no cap to guard here.
    const group = defaults(shape);
    group.base.id = crypto.randomUUID();
    setDocument((current) => ({
      ...current,
      groups: [...current.groups, group],
    }));
    setSelection({ kind: "group", id: group.base.id });
    setActivePanel("groups");
  }

  function handleDuplicateGroup(id: string) {
    setDocument((current) => {
      const index = current.groups.findIndex((group) => group.base.id === id);
      if (index < 0) return current;
      const copy = cloneGroupWithFreshIds(current.groups[index]);
      const groups = [...current.groups];
      groups.splice(index + 1, 0, copy);
      return { ...current, groups };
    });
  }

  function handleReorder(activeId: string, overId: string) {
    setDocument((current) => {
      const oldIndex = current.groups.findIndex(
        (group) => group.base.id === activeId,
      );
      const newIndex = current.groups.findIndex(
        (group) => group.base.id === overId,
      );
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return current;
      }
      return { ...current, groups: arrayMove(current.groups, oldIndex, newIndex) };
    });
  }

  function deleteGroup(id: string) {
    setDocument((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.base.id !== id),
    }));
    setSelection((current) =>
      current?.kind === "group" && current.id === id ? null : current,
    );
    toast.success(dict.groupDeletedToast);
  }

  // Delete asks for confirmation only when the group has items; an empty
  // group deletes silently. Undo covers both.
  function handleRequestDeleteGroup(group: MenuGroup) {
    if (groupHasContent(group)) {
      setDeleteTarget(group);
    } else {
      deleteGroup(group.base.id);
    }
  }

  function confirmDeleteGroup() {
    if (!deleteTarget) return;
    deleteGroup(deleteTarget.base.id);
    setDeleteTarget(null);
  }

  function handleChangeGroup(next: MenuGroup, historyGroup?: string) {
    // The registry EditorPanel contract: the panel hands back the whole group.
    setDocument(
      (current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.base.id === next.base.id ? next : group,
        ),
      }),
      historyGroup,
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

  function renderPanelContent(panel: MenuEditorPanelId): ReactNode {
    if (panel === "groups") {
      return (
        <MenuEditorGroupsPanel
          document={document}
          selection={selection}
          onSelectGroup={handleSelectGroup}
          onClearSelection={() => setSelection(null)}
          onReorder={handleReorder}
          onAddGroup={handleAddGroup}
          onDuplicateGroup={handleDuplicateGroup}
          onRequestDeleteGroup={handleRequestDeleteGroup}
          onChangeGroup={handleChangeGroup}
        />
      );
    }
    if (panel === "help") {
      return <MenuEditorStaticPanelContent panel={panel} />;
    }
    return (
      <MenuPagePanel
        panel={panel}
        data={data}
        document={document}
        setDocument={setDocument}
      />
    );
  }

  const deleteTargetLabel = deleteTarget
    ? `${groupDisplayName(deleteTarget)} · ${MENU_GROUP_REGISTRY[deleteTarget.shape].label}`
    : "";

  return (
    <MenuEditorPanelProvider value={panelServices}>
      <div className={styles.editorRoot}>
        {compactEditor ? (
          <MenuEditorMobileShell
            data={data}
            document={document}
            mediaUrls={mediaUrls}
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
            onSelectGroup={handleSelectGroup}
            onSelectPage={handleSelectPage}
            onReorder={handleReorder}
            panelContent={activePanel ? renderPanelContent(activePanel) : null}
          />
        ) : (
          <div className={styles.desktopEditor}>
            <MenuEditorBackdrop />

            <header className={styles.topBar} data-editor-preserve-panel="true">
              <Link
                className={styles.brandLink}
                href={`/${encodeURIComponent(data.businessSlug)}/client-panel`}
              >
                <BrandLogo width="6.6rem" />
                <span className="sr-only">{dict.backAria}</span>
              </Link>
              <div className={styles.topTitleGroup}>
                <p className={styles.topTitle}>{data.businessName}</p>
                <p className={styles.topSubtitle}>/{data.businessSlug}/meni</p>
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
                      activeSurfaceId="menu-rail-active-primary"
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
                      activeSurfaceId="menu-rail-active-secondary"
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

              <MenuEditorPreview
                data={data}
                document={document}
                mediaUrls={mediaUrls}
                selection={selection}
                onSelectGroup={handleSelectGroup}
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
                  ? fmt(dict.deleteDialogTitle, { group: deleteTargetLabel })
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
                onClick={confirmDeleteGroup}
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

        <Dialog
          open={availabilityConflict !== null}
          onOpenChange={(open) => {
            if (!open) setAvailabilityConflict(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{dict.availabilityConflictTitle}</DialogTitle>
              <DialogDescription className="leading-6">
                {fmt(dict.availabilityConflictBody, {
                  names: (availabilityConflict ?? []).join(", "),
                })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                className={styles.actionButton}
                type="button"
                disabled={publishing}
                onClick={() => void handlePublish("keepLive")}
              >
                {dict.availabilityKeepLive}
              </button>
              <button
                className={`${styles.actionButton} ${styles.publishButton}`}
                type="button"
                disabled={publishing}
                onClick={() => void handlePublish("overwrite")}
              >
                {publishing ? (
                  <LoaderCircle className="mr-2 inline size-4 animate-spin" />
                ) : null}
                {dict.availabilityOverwrite}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MenuEditorPanelProvider>
  );
}

function RailButton({
  item,
  active,
  activeSurfaceId,
  onClick,
}: {
  item: MenuEditorToolItem;
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
