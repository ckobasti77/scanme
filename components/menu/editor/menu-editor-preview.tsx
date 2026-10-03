"use client";

// The Menu editor preview (TASK-51; FORKED from
// components/venue/editor/venue-editor-preview.tsx). It renders the REAL
// `MenuTemplate` — the exact component the public route will mount — never a
// simplified copy: the template gets an empty group list and the groups render
// as its children through the same `MenuGroupRender` the template itself uses,
// each wrapped in a transparent overlay button that owns click-to-select and
// drag-to-reorder (dnd-kit). Mobile preview is the DEFAULT view — the guest
// arrives by scanning a QR code at the table — and desktop is the secondary
// toggle.

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Monitor, Smartphone } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  MenuGroupRender,
  MENU_GROUP_REGISTRY,
} from "@/components/menu/blocks/registry";
import { MenuTemplate } from "@/components/menu/menu-template";
import {
  resolveMenuMedia,
  type MenuPageView,
  type MenuRenderContext,
} from "@/components/menu/menu-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import type { MenuGroup } from "@/lib/menu-blocks";
import { groupDisplayName } from "./menu-editor-common";
import styles from "./menu-editor.module.css";
import type {
  MenuEditorData,
  MenuEditorDocument,
  MenuEditorSelection,
  MenuPreviewDevice,
} from "./menu-editor-types";

// One shared model for both shells (desktop preview and mobile canvas): the
// template view and the render context always derive from the same editor
// data, so the two previews cannot drift. The design comes from the LIVE
// document so page-panel edits preview instantly; groups render as children
// from the same document — see InteractiveMenuPreviewPage.
export function useMenuEditorPreviewModel(
  data: MenuEditorData,
  document: MenuEditorDocument,
) {
  const view = useMemo<MenuPageView>(
    () => ({
      businessName: data.businessName,
      design: document.design,
      // Groups render as children (wrapped for selection); the template's own
      // list stays empty, so its own media map is empty too.
      groups: [],
      blockImageUrls: {},
    }),
    [data.businessName, document.design],
  );

  const ctx = useMemo<MenuRenderContext>(
    () => ({
      businessSlug: data.businessSlug,
      businessName: data.businessName,
    }),
    [data.businessName, data.businessSlug],
  );

  return { view, ctx };
}

export function InteractiveMenuPreviewPage({
  data,
  document,
  mediaUrls,
  selection,
  onSelectGroup,
  onSelectPage,
  onReorder,
}: {
  data: MenuEditorData;
  document: MenuEditorDocument;
  /** storageId → displayable URL (the editor query's signed URLs merged with
   * this session's fresh-upload object URLs). */
  mediaUrls: Record<string, string>;
  selection: MenuEditorSelection;
  onSelectGroup: (id: string) => void;
  onSelectPage: () => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const { view, ctx } = useMenuEditorPreviewModel(data, document);

  // The same substitution the public page performs (menu-view.ts): embedded
  // storage ids become real URLs BEFORE the group renderers run.
  const resolvedGroups = useMemo(
    () => resolveMenuMedia(document.groups, mediaUrls),
    [document.groups, mediaUrls],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    onReorder(String(event.active.id), String(event.over.id));
  }

  return (
    // Clicking template chrome (masthead, footer, background) selects the
    // page; the per-group overlays stop propagation by being buttons above it.
    <div data-menu-preview-page="true" onClick={onSelectPage}>
      <MenuTemplate view={view} businessSlug={data.businessSlug}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={resolvedGroups.map((group) => group.base.id)}
            strategy={verticalListSortingStrategy}
          >
            {resolvedGroups.map((group) => (
              <SortablePreviewGroup
                key={group.base.id}
                group={group}
                ctx={ctx}
                selected={
                  selection?.kind === "group" && selection.id === group.base.id
                }
                onSelect={() => onSelectGroup(group.base.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </MenuTemplate>
    </div>
  );
}

function SortablePreviewGroup({
  group,
  ctx,
  selected,
  onSelect,
}: {
  group: MenuGroup;
  ctx: MenuRenderContext;
  selected: boolean;
  onSelect: () => void;
}) {
  const shapeLabel = MENU_GROUP_REGISTRY[group.shape].label;
  const label = `${groupDisplayName(group)} · ${shapeLabel}`;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.base.id });

  const wrapStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.88 : 1,
  };

  return (
    // The REAL render path decides what shows: the exact MenuGroupRender the
    // template uses. A group with no items renders only its heading (correct
    // on the public page) and gets an editor-only dashed stand-in via the
    // [data-empty] rule in the module CSS, driven by data-empty-label — no
    // duplicated emptiness logic that could drift from the renderers.
    <div
      ref={setNodeRef}
      style={wrapStyle}
      className={styles.previewBlockWrap}
      data-empty={group.items.length === 0 ? "true" : undefined}
      data-empty-label={fmt(dict.previewEmptyGroup, {
        group: groupDisplayName(group),
      })}
    >
      <MenuGroupRender group={group} ctx={ctx} />
      <button
        type="button"
        className={styles.previewBlockOverlay}
        data-selected={selected || undefined}
        aria-label={fmt(dict.previewGroupAria, { group: label })}
        {...attributes}
        {...listeners}
        aria-pressed={selected}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      />
    </div>
  );
}

const PHONE_WIDTH = 350;
const PHONE_HEIGHT = 720;

export function MenuEditorPreview({
  data,
  document,
  mediaUrls,
  selection,
  onSelectGroup,
  onSelectPage,
  onReorder,
  device,
  setDevice,
  zoom,
  setZoom,
}: {
  data: MenuEditorData;
  document: MenuEditorDocument;
  mediaUrls: Record<string, string>;
  selection: MenuEditorSelection;
  onSelectGroup: (id: string) => void;
  onSelectPage: () => void;
  onReorder: (activeId: string, overId: string) => void;
  device: MenuPreviewDevice;
  setDevice: (device: MenuPreviewDevice) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
}) {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setCanvasSize({
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
  }, []);

  useLayoutEffect(() => {
    syncCanvasSize();
  }, [device, syncCanvasSize, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeObserver = new ResizeObserver(syncCanvasSize);
    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [syncCanvasSize]);

  // 100% zoom always means "the whole phone fits"; higher zoom deliberately
  // overflows into canvas scroll.
  const fitScale =
    canvasSize.width && canvasSize.height
      ? Math.min(
          1,
          (canvasSize.height - 14) / PHONE_HEIGHT,
          (canvasSize.width - 16) / PHONE_WIDTH,
        )
      : 1;
  const phoneScale = fitScale * (zoom / 100);

  const page = (
    <InteractiveMenuPreviewPage
      data={data}
      document={document}
      mediaUrls={mediaUrls}
      selection={selection}
      onSelectGroup={onSelectGroup}
      onSelectPage={onSelectPage}
      onReorder={onReorder}
    />
  );

  return (
    <section
      className={styles.previewStage}
      aria-label={fmt(dict.previewAria, { name: data.businessName })}
    >
      <div className={styles.previewToolbar} data-editor-preserve-panel="true">
        <div className={styles.toolbarGroup} aria-label={dict.deviceGroupAria}>
          <button
            type="button"
            className={`${styles.toolbarButton} ${
              device === "phone" ? styles.toolbarActive : ""
            }`}
            aria-label={dict.devicePhoneAria}
            aria-pressed={device === "phone"}
            onClick={() => setDevice("phone")}
          >
            <Smartphone className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.toolbarButton} ${
              device === "desktop" ? styles.toolbarActive : ""
            }`}
            aria-label={dict.deviceDesktopAria}
            aria-pressed={device === "desktop"}
            onClick={() => setDevice("desktop")}
          >
            <Monitor className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        {/* Bounded control: an enumerated zoom list, never a free numeric
            input — constrained freedom applies to chrome too. */}
        <Select
          value={String(zoom)}
          onValueChange={(value) => setZoom(Number(value))}
        >
          <SelectTrigger className={styles.zoomSelect} aria-label={dict.zoomAria}>
            <SelectValue>{zoom}%</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[50, 75, 100, 125, 150].map((value) => (
              <SelectItem key={value} value={String(value)}>
                {value}%
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        ref={canvasRef}
        className={styles.deviceCanvas}
        data-device={device}
        onScroll={syncCanvasSize}
      >
        <AnimatePresence mode="wait" initial={false}>
          {device === "phone" ? (
            <motion.div
              key="phone"
              className={styles.phoneFit}
              style={{
                width: `${PHONE_WIDTH * phoneScale}px`,
                height: `${PHONE_HEIGHT * phoneScale}px`,
              }}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
            >
              <div
                className={styles.phoneShell}
                data-editor-preview="true"
                style={{ transform: `scale(${phoneScale})` }}
              >
                <div className={styles.phoneScreen}>
                  <div className={styles.phoneContent}>{page}</div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="desktop"
              className={styles.desktopShell}
              data-editor-preview="true"
              style={{ transform: `scale(${zoom / 100})` }}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reducedMotion ? 0.01 : 0.18 }}
            >
              <div className={styles.desktopScreen}>{page}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
