"use client";

// The per-group property panel (TASK-51; FORKED from the panel pattern of
// components/venue/editor/venue-editor-block-panels.tsx). Venue has twelve
// block types with twelve panels; Menu has five SHAPES of one thing — a group
// of items — so ONE panel serves all five, with the shape-specific hint
// (Istaknuto shows one item; Tabela varijanti renders variants as rows) and
// the shape select itself. The registry seam stays narrow: the panel receives
// exactly { group, onChange }; uploads, the palette, the daypart list and the
// pairable items come from the panel context. This module is imported ONLY by
// the editor, so the public render path never bundles a panel.
//
// Constrained freedom: prices are NumberFields bounded by MENU_BOUNDS.price
// (the same tuple clampItem enforces server-side); variants and pairings
// surface their caps (MAX_VARIANTS_PER_ITEM / MAX_PAIRINGS_PER_ITEM) before
// the server would reject; the shape select enumerates the five shapes.
// Items and groups have NO cap (RFC-003 §2.7).

import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { fmt } from "@/lib/i18n";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import { MENU_KNOWN_PRODUCT_TYPES } from "@/components/menu/menu-glyph-map";
import {
  MENU_GROUP_REGISTRY,
  type MenuGroupEditorPanelProps,
} from "@/components/menu/blocks/registry";
import {
  itemDefaults,
  MAX_PAIRINGS_PER_ITEM,
  MAX_VARIANTS_PER_ITEM,
  MENU_BOUNDS,
  MENU_GROUP_SHAPES,
  variantDefaults,
  VISIBLE_COUNT,
  type ItemPairing,
  type ItemVariant,
  type MenuGroup,
  type MenuGroupBase,
  type MenuGroupShape,
  type MenuItem,
} from "@/lib/menu-blocks";
import {
  NumberField,
  SelectField,
  SubHeading,
  TextAreaField,
  TextField,
  ToggleRow,
} from "./menu-editor-fields";
import { EditableItemList } from "./menu-editor-item-list";
import { useMenuPanelServices } from "./menu-editor-panel-context";
import { MediaUploadTile } from "./menu-editor-upload";
import styles from "./menu-editor.module.css";

// A sentinel option for "no override" selects (icon, daypart) — never stored.
const INHERIT = "__inherit" as const;

// Patch an item, DELETING keys set to undefined so an optional field is
// absent rather than present-as-undefined (the stable hash and the validator
// both prefer absence).
function patchItem(item: MenuItem, partial: Partial<MenuItem>): MenuItem {
  const next: MenuItem = { ...item, ...partial };
  for (const key of Object.keys(partial) as (keyof MenuItem)[]) {
    if (partial[key] === undefined) delete next[key];
  }
  return next;
}

function patchBase(
  base: MenuGroupBase,
  partial: Partial<MenuGroupBase>,
): MenuGroupBase {
  const next: MenuGroupBase = { ...base, ...partial };
  for (const key of Object.keys(partial) as (keyof MenuGroupBase)[]) {
    if (partial[key] === undefined) delete next[key];
  }
  return next;
}

// The union has five structurally identical arms; a shape switch keeps the
// group's base and items (non-destructive — Istaknuto never deletes, §2.1).
function withShape(group: MenuGroup, shape: MenuGroupShape): MenuGroup {
  switch (shape) {
    case "lista":
    case "galerija":
    case "traka":
    case "istaknuto":
    case "tabela_varijanti":
      return { shape, base: group.base, items: group.items };
  }
}

// A glyph key as the owner reads it: the canonical map key with a capital.
function iconOptionLabel(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function ShapeHint({ shape }: { shape: MenuGroupShape }) {
  if (shape === "istaknuto") {
    return <p className={styles.fieldHint}>{dict.istaknutoHint}</p>;
  }
  if (shape === "tabela_varijanti") {
    return <p className={styles.fieldHint}>{dict.tabelaHint}</p>;
  }
  return (
    <p className={styles.fieldHint}>
      {fmt(dict.visibleCountHint, { count: VISIBLE_COUNT })}
    </p>
  );
}

// ---------------------------------------------------------------- the group

export function GroupPanel({ group, onChange }: MenuGroupEditorPanelProps) {
  const services = useMenuPanelServices();
  const setBase = (partial: Partial<MenuGroupBase>, key?: string) =>
    onChange(
      { ...group, base: patchBase(group.base, partial) },
      key ? `${group.base.id}:${key}` : undefined,
    );
  const setItems = (items: MenuItem[]) => onChange({ ...group, items });

  const iconOptions = [
    { value: INHERIT, label: dict.groupIconInherit },
    ...MENU_KNOWN_PRODUCT_TYPES.map((key) => ({
      value: key,
      label: iconOptionLabel(key),
    })),
  ];
  const daypartOptions = [
    { value: INHERIT, label: dict.daypartAlways },
    ...services.dayparts
      .filter((daypart) => daypart.key.trim() !== "")
      .map((daypart) => ({
        value: daypart.key,
        label: daypart.label.trim() || daypart.key,
      })),
  ];
  // A daypart the owner removed leaves the group's key dangling; offer it so
  // the select still shows the truth instead of a blank.
  const daypartKey = group.base.daypartKey;
  if (
    daypartKey &&
    !daypartOptions.some((option) => option.value === daypartKey)
  ) {
    daypartOptions.push({ value: daypartKey, label: daypartKey });
  }

  return (
    <div className={styles.panelForm}>
      <TextField
        label={dict.groupTitleLabel}
        value={group.base.title}
        maxLength={80}
        error={group.base.title.trim() === "" ? dict.requiredFieldError : null}
        onChange={(title) => setBase({ title }, "title")}
      />
      <SelectField
        label={dict.groupShapeLabel}
        value={group.shape}
        options={MENU_GROUP_SHAPES.map((shape) => ({
          value: shape,
          label: MENU_GROUP_REGISTRY[shape].label,
        }))}
        onChange={(shape) => onChange(withShape(group, shape))}
      />
      <ShapeHint shape={group.shape} />
      <SelectField
        label={dict.groupIconLabel}
        value={group.base.iconKey ?? INHERIT}
        options={iconOptions}
        onChange={(value) =>
          setBase({ iconKey: value === INHERIT ? undefined : value })
        }
      />
      <SelectField
        label={dict.groupDaypartLabel}
        value={daypartKey ?? INHERIT}
        options={daypartOptions}
        onChange={(value) =>
          setBase({ daypartKey: value === INHERIT ? undefined : value })
        }
      />

      <EditableItemList
        heading={dict.itemsHeading}
        items={group.items}
        onItemsChange={setItems}
        itemName={(item) => item.name}
        addLabel={dict.itemsAdd}
        onAdd={() =>
          setItems([
            ...group.items,
            { ...itemDefaults(), id: crypto.randomUUID() },
          ])
        }
        renderItem={(item) => (
          <ItemEditor
            item={item}
            onChange={(next) =>
              setItems(
                group.items.map((other) =>
                  other.id === next.id ? next : other,
                ),
              )
            }
          />
        )}
      />
    </div>
  );
}

// ----------------------------------------------------------------- the item

function ItemEditor({
  item,
  onChange,
}: {
  item: MenuItem;
  onChange: (next: MenuItem) => void;
}) {
  const patch = (partial: Partial<MenuItem>) => onChange(patchItem(item, partial));
  const iconOptions = [
    { value: INHERIT, label: dict.itemIconInherit },
    ...MENU_KNOWN_PRODUCT_TYPES.map((key) => ({
      value: key,
      label: iconOptionLabel(key),
    })),
  ];

  return (
    <>
      <TextField
        label={dict.itemNameLabel}
        value={item.name}
        maxLength={120}
        error={item.name.trim() === "" ? dict.requiredFieldError : null}
        onChange={(name) => patch({ name })}
      />
      <TextField
        label={dict.itemProductTypeLabel}
        value={item.productType}
        maxLength={60}
        placeholder={dict.itemProductTypePlaceholder}
        hint={dict.itemProductTypeHint}
        suggestions={MENU_KNOWN_PRODUCT_TYPES}
        onChange={(productType) => patch({ productType })}
      />
      <TextAreaField
        label={dict.itemDescriptionLabel}
        value={item.description ?? ""}
        rows={3}
        onChange={(next) =>
          patch({ description: next.trim() === "" ? undefined : next })
        }
      />
      <NumberField
        label={dict.itemPriceLabel}
        value={item.priceRsd ?? ""}
        min={MENU_BOUNDS.price[0]}
        max={MENU_BOUNDS.price[1]}
        hint={dict.itemPriceHint}
        onChange={(price) =>
          patch({ priceRsd: price === "" ? undefined : price })
        }
      />
      <SelectField
        label={dict.itemIconLabel}
        value={item.iconKey ?? INHERIT}
        options={iconOptions}
        onChange={(value) =>
          patch({ iconKey: value === INHERIT ? undefined : value })
        }
      />
      <ToggleRow
        label={dict.itemAvailableLabel}
        checked={item.available}
        hint={dict.itemAvailableHint}
        onChange={(available) => patch({ available })}
      />

      <SubHeading>{dict.itemPhotoHeading}</SubHeading>
      <MediaUploadTile
        kind="image"
        storageId={item.photoStorageId}
        onUploaded={(storageId) => patch({ photoStorageId: storageId })}
        onRemove={
          item.photoStorageId
            ? () => patch({ photoStorageId: undefined })
            : undefined
        }
      />
      <p className={styles.fieldHint}>{dict.itemPhotoHint}</p>

      <EditableItemList
        heading={dict.variantsHeading}
        items={item.variants}
        onItemsChange={(variants) => patch({ variants })}
        itemName={(variant) => variant.label}
        addLabel={dict.variantAdd}
        cap={{ count: item.variants.length, max: MAX_VARIANTS_PER_ITEM }}
        onAdd={() =>
          patch({
            variants: [
              ...item.variants,
              { ...variantDefaults(), id: crypto.randomUUID() },
            ],
          })
        }
        renderItem={(variant) => (
          <VariantEditor
            variant={variant}
            onChange={(next) =>
              patch({
                variants: item.variants.map((other) =>
                  other.id === next.id ? next : other,
                ),
              })
            }
          />
        )}
      />

      <PairingsEditor item={item} onChange={(pairings) => patch({ pairings })} />
    </>
  );
}

function VariantEditor({
  variant,
  onChange,
}: {
  variant: ItemVariant;
  onChange: (next: ItemVariant) => void;
}) {
  return (
    <>
      <TextField
        label={dict.variantLabelLabel}
        value={variant.label}
        maxLength={40}
        placeholder={dict.variantLabelPlaceholder}
        error={variant.label.trim() === "" ? dict.requiredFieldError : null}
        onChange={(label) => onChange({ ...variant, label })}
      />
      <NumberField
        label={dict.variantPriceLabel}
        value={variant.priceRsd}
        min={MENU_BOUNDS.price[0]}
        max={MENU_BOUNDS.price[1]}
        onChange={(price) =>
          onChange({ ...variant, priceRsd: price === "" ? 0 : price })
        }
      />
    </>
  );
}

// "Ide uz" (RFC-003 §2.3): a MANUAL relation the owner draws to another item
// anywhere in the menu — a select over every other item, never auto-derived.
function PairingsEditor({
  item,
  onChange,
}: {
  item: MenuItem;
  onChange: (next: ItemPairing[]) => void;
}) {
  const services = useMenuPanelServices();
  const byId = new Map(services.pairableItems.map((other) => [other.id, other]));
  const paired = new Set(item.pairings.map((pairing) => pairing.pairedItemId));
  const candidates = services.pairableItems.filter(
    (other) => other.id !== item.id && !paired.has(other.id),
  );
  const atCap = item.pairings.length >= MAX_PAIRINGS_PER_ITEM;

  function pairingName(pairing: ItemPairing) {
    const target = byId.get(pairing.pairedItemId);
    if (!target) return dict.pairingUnknown;
    const name = target.name.trim() || dict.itemUntitled;
    return target.groupTitle ? `${name} · ${target.groupTitle}` : name;
  }

  let addControl: ReactNode;
  if (candidates.length === 0) {
    addControl = <p className={styles.fieldHint}>{dict.pairingNone}</p>;
  } else {
    addControl = (
      <SelectField
        label={dict.pairingPickLabel}
        value=""
        options={[
          { value: "", label: dict.pairingPickPlaceholder },
          ...candidates.map((other) => ({
            value: other.id,
            label: other.groupTitle
              ? `${other.name.trim() || dict.itemUntitled} · ${other.groupTitle}`
              : other.name.trim() || dict.itemUntitled,
          })),
        ]}
        onChange={(pairedItemId) => {
          if (pairedItemId === "") return;
          onChange([
            ...item.pairings,
            { id: crypto.randomUUID(), pairedItemId },
          ]);
        }}
      />
    );
  }

  return (
    <div className={styles.itemListSection}>
      <h4 className={styles.fieldSubHeading}>
        <span>{dict.pairingsHeading}</span>
        <span className={styles.capCount}>
          {fmt(dict.itemCapCount, {
            count: item.pairings.length,
            max: MAX_PAIRINGS_PER_ITEM,
          })}
        </span>
      </h4>
      {item.pairings.length > 0 ? (
        <ul className={styles.itemList}>
          {item.pairings.map((pairing) => {
            const name = pairingName(pairing);
            return (
              <li key={pairing.id} className={styles.itemCard}>
                <div className={styles.itemCardHeader}>
                  <span className={styles.itemCardName}>{name}</span>
                  <button
                    type="button"
                    className={styles.blockRowAction}
                    data-tone="danger"
                    aria-label={fmt(dict.pairingRemoveAria, { name })}
                    onClick={() =>
                      onChange(
                        item.pairings.filter((other) => other.id !== pairing.id),
                      )
                    }
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      {atCap ? (
        <p className={styles.capNotice} role="status">
          {fmt(dict.itemCapReached, { max: MAX_PAIRINGS_PER_ITEM })}
        </p>
      ) : (
        addControl
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor-side panel map: the registry's EditorPanel seam, filled here so
// the public render path (which imports the registry) never bundles a panel.
// Five shapes, one panel — the shape is a select inside it.
// ---------------------------------------------------------------------------

export const MENU_GROUP_EDITOR_PANELS: Record<
  MenuGroupShape,
  (props: MenuGroupEditorPanelProps) => ReactNode
> = {
  lista: GroupPanel,
  galerija: GroupPanel,
  traka: GroupPanel,
  istaknuto: GroupPanel,
  tabela_varijanti: GroupPanel,
};
