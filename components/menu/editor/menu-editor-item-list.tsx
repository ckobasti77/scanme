"use client";

// The list-item editor every list-shaped control reuses (TASK-51; FORKED from
// components/venue/editor/venue-editor-item-list.tsx): add / remove /
// drag-reorder (dnd-kit, keyboard sensor included) with a cap surfaced BEFORE
// the server would reject — a visible count and a disabled add button with a
// written reason. Items, variants, pairings and dayparts all ride on this.

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
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import styles from "./menu-editor.module.css";

export function EditableItemList<T extends { id: string }>({
  heading,
  items,
  onItemsChange,
  renderItem,
  itemName,
  addLabel,
  onAdd,
  cap,
  addDisabled,
  capNotice,
  addControl,
}: {
  heading: string;
  items: readonly T[];
  onItemsChange: (next: T[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  itemName: (item: T) => string;
  addLabel: string;
  /** Appends a fresh item; the caller owns its defaults. */
  onAdd?: () => void;
  /** When present, "{count} / {max}" is always visible next to the heading.
   * Groups and items are UNLIMITED (RFC-003 §2.7) — only variants and
   * pairings carry a cap. */
  cap?: { count: number; max: number };
  /** Extra add-disable condition beyond the cap. */
  addDisabled?: boolean;
  /** The written reason shown while adding is disabled. */
  capNotice?: string;
  /** Replaces the default add button. Hidden while the cap is reached; the
   * notice still shows. */
  addControl?: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const atCap = cap ? cap.count >= cap.max : false;
  const disabled = atCap || Boolean(addDisabled);
  const notice =
    disabled &&
    (capNotice ?? (cap ? fmt(dict.itemCapReached, { max: cap.max }) : undefined));

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = items.findIndex((item) => item.id === event.active.id);
    const newIndex = items.findIndex((item) => item.id === event.over!.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onItemsChange(arrayMove([...items], oldIndex, newIndex));
  }

  return (
    <div className={styles.itemListSection}>
      <h4 className={styles.fieldSubHeading}>
        <span>{heading}</span>
        {cap ? (
          <span className={styles.capCount}>
            {fmt(dict.itemCapCount, { count: cap.count, max: cap.max })}
          </span>
        ) : null}
      </h4>
      {items.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className={styles.itemList}>
              {items.map((item, index) => (
                <SortableItemCard
                  key={item.id}
                  id={item.id}
                  name={itemName(item) || dict.itemUntitled}
                  onRemove={() =>
                    onItemsChange(items.filter((other) => other.id !== item.id))
                  }
                >
                  {renderItem(item, index)}
                </SortableItemCard>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
      {notice ? (
        <p className={styles.capNotice} role="status">
          {notice}
        </p>
      ) : null}
      {addControl !== undefined ? (
        disabled ? null : addControl
      ) : (
        <button
          type="button"
          className={styles.itemAddButton}
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus className="size-4" aria-hidden="true" />
          {addLabel}
        </button>
      )}
    </div>
  );
}

function SortableItemCard({
  id,
  name,
  onRemove,
  children,
}: {
  id: string;
  name: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} className={styles.itemCard}>
      <div className={styles.itemCardHeader}>
        <button
          type="button"
          className={`${styles.blockRowAction} ${styles.dragHandle}`}
          aria-label={fmt(dict.itemDragAria, { name })}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <span className={styles.itemCardName}>{name}</span>
        <button
          type="button"
          className={styles.blockRowAction}
          data-tone="danger"
          aria-label={fmt(dict.itemRemoveAria, { name })}
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className={styles.itemCardBody}>{children}</div>
    </li>
  );
}
