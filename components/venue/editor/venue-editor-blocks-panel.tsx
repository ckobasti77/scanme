"use client";

// The `blocks` panel (TASK-10 STEP 3): the block palette. Add, reorder,
// duplicate, delete — the one fully-functional panel of this task. Reordering
// mirrors the Links destinations pattern (dnd-kit sortable, keyboard sensor
// included); the 30-block cap is surfaced HERE, before the server would ever
// reject anything: a visible capacity meter plus disabled add-tiles with a
// written reason. When a block is selected the panel shows the registry's
// EditorPanel seam (a placeholder until TASK-11 fills it).

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
import { ChevronLeft, Copy, GripVertical, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { VENUE_BLOCK_REGISTRY } from "@/components/venue/blocks/registry";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import {
  MAX_BLOCKS,
  VENUE_BLOCK_TYPES,
  type VenueBlock,
  type VenueBlockType,
} from "@/lib/venue-blocks";
import {
  SelectedBlockPanel,
  selectedBlockTitle,
} from "./venue-editor-common";
import styles from "./venue-editor.module.css";
import type {
  VenueEditorDocument,
  VenueEditorSelection,
} from "./venue-editor-types";

export function VenueEditorBlocksPanel({
  document,
  selection,
  allowedBlockKeys,
  onSelectBlock,
  onClearSelection,
  onReorder,
  onAddBlock,
  onDuplicateBlock,
  onRequestDeleteBlock,
  onChangeBlock,
}: {
  document: VenueEditorDocument;
  selection: VenueEditorSelection;
  // The plan's allow-list (TASK-43): blocks outside it are NOT offered — this
  // is UX only; convex/venue.ts enforces the same list at save/publish.
  allowedBlockKeys: string[];
  onSelectBlock: (id: string) => void;
  onClearSelection: () => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddBlock: (type: VenueBlockType) => void;
  onDuplicateBlock: (id: string) => void;
  onRequestDeleteBlock: (block: VenueBlock) => void;
  onChangeBlock: (next: VenueBlock, group?: string) => void;
}) {
  const blocks = document.blocks;
  const allowedSet = new Set(allowedBlockKeys);
  const offeredTypes = VENUE_BLOCK_TYPES.filter((type) => allowedSet.has(type));
  const selectedBlock =
    selection?.kind === "block"
      ? blocks.find((block) => block.base.id === selection.id) ?? null
      : null;

  if (selectedBlock) {
    return (
      <div className={styles.panelSection}>
        <button
          type="button"
          className={styles.panelBackButton}
          onClick={onClearSelection}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {dict.blockPanelBack}
        </button>
        <h3 className={styles.helpTitle}>{selectedBlockTitle(selectedBlock)}</h3>
        <SelectedBlockPanel block={selectedBlock} onChange={onChangeBlock} />
      </div>
    );
  }

  const atCap = blocks.length >= MAX_BLOCKS;

  return (
    <>
      <div className={styles.panelSection}>
        <h3 className={styles.panelSectionHeading}>
          <span>{dict.blocksListHeading}</span>
          <span className={styles.capCount}>
            {fmt(dict.blockCount, {
              count: blocks.length,
              max: MAX_BLOCKS,
            })}
          </span>
        </h3>
        {/* The capacity meter: the 30-block cap, visible before the server
            would have to say no. */}
        <div className={styles.capMeter}>
          <div className={styles.capTrack} aria-hidden="true">
            <div
              className={styles.capFill}
              style={{
                width: `${Math.min(100, (blocks.length / MAX_BLOCKS) * 100)}%`,
              }}
            />
          </div>
        </div>
        {blocks.length === 0 ? (
          <p className={styles.blocksEmpty}>{dict.blocksEmpty}</p>
        ) : (
          <SortableBlockList
            blocks={blocks}
            selection={selection}
            allowedSet={allowedSet}
            onSelectBlock={onSelectBlock}
            onReorder={onReorder}
            onDuplicateBlock={onDuplicateBlock}
            onRequestDeleteBlock={onRequestDeleteBlock}
            duplicateDisabled={atCap}
          />
        )}
      </div>

      <div className={styles.panelSection}>
        <h3 className={styles.panelSectionHeading}>
          <span>{dict.blocksAddHeading}</span>
        </h3>
        {atCap ? (
          <p className={styles.capNotice} role="status">
            {fmt(dict.blocksCapReached, { max: MAX_BLOCKS })}
          </p>
        ) : null}
        <div className={styles.addGrid}>
          {offeredTypes.map((type) => {
            const entry = VENUE_BLOCK_REGISTRY[type];
            const Icon = entry.icon;
            return (
              <button
                key={type}
                type="button"
                className={styles.addTile}
                disabled={atCap}
                aria-label={fmt(dict.addBlockAria, { block: entry.label })}
                onClick={() => onAddBlock(type)}
              >
                <span className={styles.addTileIcon} aria-hidden="true">
                  <Icon className="size-[17px]" strokeWidth={1.8} />
                </span>
                <span>{entry.label}</span>
              </button>
            );
          })}
        </div>
        {offeredTypes.length < VENUE_BLOCK_TYPES.length ? (
          <p className={styles.capNotice}>{dict.blocksPremiumNote}</p>
        ) : null}
      </div>
    </>
  );
}

function SortableBlockList({
  blocks,
  selection,
  allowedSet,
  onSelectBlock,
  onReorder,
  onDuplicateBlock,
  onRequestDeleteBlock,
  duplicateDisabled,
}: {
  blocks: VenueBlock[];
  selection: VenueEditorSelection;
  allowedSet: Set<string>;
  onSelectBlock: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDuplicateBlock: (id: string) => void;
  onRequestDeleteBlock: (block: VenueBlock) => void;
  duplicateDisabled: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    onReorder(String(event.active.id), String(event.over.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={blocks.map((block) => block.base.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className={styles.blockList}>
          {blocks.map((block) => (
            <SortableBlockRow
              key={block.base.id}
              block={block}
              selected={
                selection?.kind === "block" && selection.id === block.base.id
              }
              premiumLocked={!allowedSet.has(block.type)}
              onSelect={() => onSelectBlock(block.base.id)}
              onDuplicate={() => onDuplicateBlock(block.base.id)}
              onRequestDelete={() => onRequestDeleteBlock(block)}
              duplicateDisabled={duplicateDisabled}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableBlockRow({
  block,
  selected,
  premiumLocked,
  onSelect,
  onDuplicate,
  onRequestDelete,
  duplicateDisabled,
}: {
  block: VenueBlock;
  selected: boolean;
  // An existing block the plan no longer allows (downgrade): kept in the
  // draft, marked so the owner knows why the server will refuse a save.
  premiumLocked: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRequestDelete: () => void;
  duplicateDisabled: boolean;
}) {
  const entry = VENUE_BLOCK_REGISTRY[block.type];
  const Icon = entry.icon;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.base.id });

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={rowStyle}
      className={styles.blockRow}
      data-selected={selected || undefined}
    >
      <button
        type="button"
        className={`${styles.blockRowAction} ${styles.dragHandle}`}
        aria-label={fmt(dict.dragHandleAria, { block: entry.label })}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.blockRowMain}
        aria-label={fmt(dict.blockItemAria, { block: entry.label })}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span className={styles.blockChip} aria-hidden="true">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <span className={styles.blockRowLabel}>{entry.label}</span>
        {premiumLocked ? (
          <span className={styles.premiumChip}>{dict.blockPremiumChip}</span>
        ) : null}
      </button>
      <span className={styles.blockRowActions}>
        <button
          type="button"
          className={styles.blockRowAction}
          aria-label={fmt(dict.duplicateAria, { block: entry.label })}
          disabled={duplicateDisabled}
          onClick={onDuplicate}
        >
          <Copy className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.blockRowAction}
          data-tone="danger"
          aria-label={fmt(dict.deleteAria, { block: entry.label })}
          onClick={onRequestDelete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}
