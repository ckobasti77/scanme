"use client";

// The `groups` panel (TASK-51; FORKED from
// components/venue/editor/venue-editor-blocks-panel.tsx): the group palette.
// Add (one tile per shape — the five of RFC-003 §2.1), reorder, duplicate,
// delete. Reordering mirrors the Venue pattern (dnd-kit sortable, keyboard
// sensor included). No capacity meter: groups are UNLIMITED (§2.7), so there
// is no cap to surface. When a group is selected the panel shows the
// registry's EditorPanel seam, filled by menu-editor-group-panels.

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
import { MENU_GROUP_REGISTRY } from "@/components/menu/blocks/registry";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import {
  MENU_GROUP_SHAPES,
  type MenuGroup,
  type MenuGroupShape,
} from "@/lib/menu-blocks";
import {
  groupDisplayName,
  SelectedGroupPanel,
  selectedGroupTitle,
} from "./menu-editor-common";
import styles from "./menu-editor.module.css";
import type {
  MenuEditorDocument,
  MenuEditorSelection,
} from "./menu-editor-types";

export function MenuEditorGroupsPanel({
  document,
  selection,
  onSelectGroup,
  onClearSelection,
  onReorder,
  onAddGroup,
  onDuplicateGroup,
  onRequestDeleteGroup,
  onChangeGroup,
}: {
  document: MenuEditorDocument;
  selection: MenuEditorSelection;
  onSelectGroup: (id: string) => void;
  onClearSelection: () => void;
  onReorder: (activeId: string, overId: string) => void;
  onAddGroup: (shape: MenuGroupShape) => void;
  onDuplicateGroup: (id: string) => void;
  onRequestDeleteGroup: (group: MenuGroup) => void;
  onChangeGroup: (next: MenuGroup, historyGroup?: string) => void;
}) {
  const groups = document.groups;
  const selectedGroup =
    selection?.kind === "group"
      ? (groups.find((group) => group.base.id === selection.id) ?? null)
      : null;

  if (selectedGroup) {
    return (
      <div className={styles.panelSection}>
        <button
          type="button"
          className={styles.panelBackButton}
          onClick={onClearSelection}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {dict.groupPanelBack}
        </button>
        <h3 className={styles.helpTitle}>{selectedGroupTitle(selectedGroup)}</h3>
        <SelectedGroupPanel group={selectedGroup} onChange={onChangeGroup} />
      </div>
    );
  }

  return (
    <>
      <div className={styles.panelSection}>
        <h3 className={styles.panelSectionHeading}>
          <span>{dict.groupsListHeading}</span>
          <span className={styles.capCount}>
            {fmt(dict.groupCount, { count: groups.length })}
          </span>
        </h3>
        {groups.length === 0 ? (
          <p className={styles.blocksEmpty}>{dict.groupsEmpty}</p>
        ) : (
          <SortableGroupList
            groups={groups}
            selection={selection}
            onSelectGroup={onSelectGroup}
            onReorder={onReorder}
            onDuplicateGroup={onDuplicateGroup}
            onRequestDeleteGroup={onRequestDeleteGroup}
          />
        )}
      </div>

      <div className={styles.panelSection}>
        <h3 className={styles.panelSectionHeading}>
          <span>{dict.groupsAddHeading}</span>
        </h3>
        <div className={styles.addGrid}>
          {MENU_GROUP_SHAPES.map((shape) => {
            const entry = MENU_GROUP_REGISTRY[shape];
            const Icon = entry.icon;
            return (
              <button
                key={shape}
                type="button"
                className={styles.addTile}
                aria-label={fmt(dict.addGroupAria, { shape: entry.label })}
                onClick={() => onAddGroup(shape)}
              >
                <span className={styles.addTileIcon} aria-hidden="true">
                  <Icon className="size-[17px]" strokeWidth={1.8} />
                </span>
                <span>{entry.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function SortableGroupList({
  groups,
  selection,
  onSelectGroup,
  onReorder,
  onDuplicateGroup,
  onRequestDeleteGroup,
}: {
  groups: MenuGroup[];
  selection: MenuEditorSelection;
  onSelectGroup: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onDuplicateGroup: (id: string) => void;
  onRequestDeleteGroup: (group: MenuGroup) => void;
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
        items={groups.map((group) => group.base.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className={styles.blockList}>
          {groups.map((group) => (
            <SortableGroupRow
              key={group.base.id}
              group={group}
              selected={
                selection?.kind === "group" && selection.id === group.base.id
              }
              onSelect={() => onSelectGroup(group.base.id)}
              onDuplicate={() => onDuplicateGroup(group.base.id)}
              onRequestDelete={() => onRequestDeleteGroup(group)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableGroupRow({
  group,
  selected,
  onSelect,
  onDuplicate,
  onRequestDelete,
}: {
  group: MenuGroup;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRequestDelete: () => void;
}) {
  const entry = MENU_GROUP_REGISTRY[group.shape];
  const Icon = entry.icon;
  const name = groupDisplayName(group);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.base.id });

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
        aria-label={fmt(dict.dragHandleAria, { group: name })}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        className={styles.blockRowMain}
        aria-label={fmt(dict.groupItemAria, { group: name })}
        aria-pressed={selected}
        onClick={onSelect}
        title={entry.label}
      >
        <span className={styles.blockChip} aria-hidden="true">
          <Icon className="size-4" strokeWidth={1.8} />
        </span>
        <span className={styles.blockRowLabel}>{name}</span>
        <span className={styles.premiumChip}>
          {fmt(dict.groupItemCount, { count: group.items.length })}
        </span>
      </button>
      <span className={styles.blockRowActions}>
        <button
          type="button"
          className={styles.blockRowAction}
          aria-label={fmt(dict.duplicateAria, { group: name })}
          onClick={onDuplicate}
        >
          <Copy className="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.blockRowAction}
          data-tone="danger"
          aria-label={fmt(dict.deleteAria, { group: name })}
          onClick={onRequestDelete}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}
