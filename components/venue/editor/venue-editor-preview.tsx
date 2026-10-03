"use client";

// The Venue editor preview (TASK-10 STEP 4). It renders the REAL
// `VenueTemplate` — the exact component the public route mounts — never a
// simplified copy: the template gets an empty block list and the blocks render
// as its children through the same `BlockShell` + `renderVenueBlockContent`
// pair the template itself uses, each wrapped in a transparent overlay button
// that owns click-to-select and drag-to-reorder (dnd-kit, the Links
// destinations precedent). Mobile preview is the DEFAULT view — nearly every
// visitor arrives by scanning a QR code on a phone — and desktop is the
// secondary toggle.

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
  VenueBlockRender,
  VENUE_BLOCK_REGISTRY,
} from "@/components/venue/blocks/registry";
import { VenueTemplate } from "@/components/venue/venue-template";
import {
  resolveVenueBlockMedia,
  type VenueLifecycle,
  type VenuePageView,
  type VenueRenderContext,
} from "@/components/venue/venue-view";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import type { VenueBlock } from "@/lib/venue-blocks";
import styles from "./venue-editor.module.css";
import type {
  VenueEditorData,
  VenueEditorDocument,
  VenueEditorSelection,
  VenuePreviewDevice,
} from "./venue-editor-types";

// Display lifecycle for the draft being edited: a live event previews live,
// a finished one previews the ended note, everything else previews "before".
function previewLifecycle(status: string): VenueLifecycle {
  if (status === "live") return "live";
  if (status === "ended" || status === "archived") return "after";
  return "before";
}

// One shared model for both shells (desktop preview and mobile canvas): the
// template view and the render context always derive from the same editor
// data, so the two previews cannot drift. Display name and design come from
// the LIVE document (TASK-12) so page-panel edits preview instantly; blocks
// render as children from the same document — see InteractiveVenuePreviewPage.
export function useVenueEditorPreviewModel(
  data: VenueEditorData,
  document: VenueEditorDocument,
) {
  const event = data.event!;
  const lifecycle = previewLifecycle(event.status);
  const displayName = document.displayName ?? data.businessName;
  // The document's design is the pure model shape; the view type carries the
  // stored (branded) shape. Runtime-identical — cast at the boundary.
  const design = (document.design ??
    event.draftDesign) as VenuePageView["design"];

  const view = useMemo<VenuePageView>(
    () => ({
      event: {
        slug: event.slug,
        title: event.title,
        status: event.status,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
      },
      displayName,
      design,
      // Blocks render as children (wrapped for selection); the template's own
      // list stays empty, so its own media map is empty too.
      blocks: [],
      blockImageUrls: {},
      logoUrl: event.draftLogoUrl,
      backgroundImageUrl: event.draftBackgroundImageUrl,
      backgroundVideoUrl: event.draftBackgroundVideoUrl,
    }),
    [design, displayName, event],
  );

  const ctx = useMemo<VenueRenderContext>(
    () => ({
      businessSlug: data.businessSlug,
      eventSlug: event.slug,
      eventTitle: event.title,
      displayName,
      eventStartsAt: event.startsAt,
      eventEndsAt: event.endsAt,
      lifecycle,
      pastEvents: null,
    }),
    [data.businessSlug, displayName, event, lifecycle],
  );

  return { view, ctx, lifecycle };
}

export function InteractiveVenuePreviewPage({
  data,
  document,
  mediaUrls,
  selection,
  onSelectBlock,
  onSelectPage,
  onReorder,
}: {
  data: VenueEditorData;
  document: VenueEditorDocument;
  /** storageId → displayable URL (the editor query's signed URLs merged with
   * this session's fresh-upload object URLs). */
  mediaUrls: Record<string, string>;
  selection: VenueEditorSelection;
  onSelectBlock: (id: string) => void;
  onSelectPage: () => void;
  onReorder: (activeId: string, overId: string) => void;
}) {
  const { view, ctx, lifecycle } = useVenueEditorPreviewModel(data, document);

  // The same substitution the public page performs (venue-view.ts): embedded
  // storage ids become real URLs BEFORE the block renderers run.
  const resolvedBlocks = useMemo(
    () => resolveVenueBlockMedia(document.blocks, mediaUrls),
    [document.blocks, mediaUrls],
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
    // page; the per-block overlays stop propagation by being buttons above it.
    <div data-venue-preview-page="true" onClick={onSelectPage}>
      <VenueTemplate
        view={view}
        lifecycle={lifecycle}
        businessSlug={data.businessSlug}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={resolvedBlocks.map((block) => block.base.id)}
            strategy={verticalListSortingStrategy}
          >
            {resolvedBlocks.map((block) => (
              <SortablePreviewBlock
                key={block.base.id}
                block={block}
                ctx={ctx}
                selected={
                  selection?.kind === "block" &&
                  selection.id === block.base.id
                }
                onSelect={() => onSelectBlock(block.base.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </VenueTemplate>
    </div>
  );
}

function SortablePreviewBlock({
  block,
  ctx,
  selected,
  onSelect,
}: {
  block: VenueBlock;
  ctx: VenueRenderContext;
  selected: boolean;
  onSelect: () => void;
}) {
  const label = VENUE_BLOCK_REGISTRY[block.type].label;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.base.id });

  const wrapStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.88 : 1,
  };

  return (
    // The REAL render path decides what shows: the exact VenueBlockRender the
    // template uses. A block whose content renders empty (correct on the
    // public page) gets an editor-only dashed stand-in via the
    // :has(section:empty) rule in the module CSS, driven by data-empty-label —
    // no duplicated per-type emptiness logic that could drift from the
    // renderers.
    <div
      ref={setNodeRef}
      style={wrapStyle}
      className={styles.previewBlockWrap}
      data-empty-label={fmt(dict.previewEmptyBlock, { block: label })}
    >
      <VenueBlockRender block={block} ctx={ctx} />
      <button
        type="button"
        className={styles.previewBlockOverlay}
        data-selected={selected || undefined}
        aria-label={fmt(dict.previewBlockAria, { block: label })}
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

export function VenueEditorPreview({
  data,
  document,
  mediaUrls,
  selection,
  onSelectBlock,
  onSelectPage,
  onReorder,
  device,
  setDevice,
  zoom,
  setZoom,
}: {
  data: VenueEditorData;
  document: VenueEditorDocument;
  mediaUrls: Record<string, string>;
  selection: VenueEditorSelection;
  onSelectBlock: (id: string) => void;
  onSelectPage: () => void;
  onReorder: (activeId: string, overId: string) => void;
  device: VenuePreviewDevice;
  setDevice: (device: VenuePreviewDevice) => void;
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
  // overflows into canvas scroll (the Links preview's fit-scale idea).
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
    <InteractiveVenuePreviewPage
      data={data}
      document={document}
      mediaUrls={mediaUrls}
      selection={selection}
      onSelectBlock={onSelectBlock}
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
            input (STEP 5 — constrained freedom applies to chrome too). */}
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
