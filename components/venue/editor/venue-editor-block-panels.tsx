"use client";

// The twelve per-block property panels (TASK-12 STEP 2). Each panel edits its
// block's `props` and mounts the shared BlockBaseSection for the base
// properties, so nothing is reinvented per type. The registry seam stays
// narrow: panels receive exactly the registry's { block, onChange } contract;
// uploads and the page palette come from the panel context. This module is
// imported ONLY by the editor (venue-editor-common looks panels up here), so
// the public render path never bundles a panel.
//
// Constrained freedom: every numeric range is an exported bounds tuple from
// lib/venue-blocks.ts (the same object the server's clamp reads); every colour
// control is a page-palette swatch row; enums are closed segmented/select
// sets. Caps (gallery 24, programme 40, price list 60) are surfaced in the
// list editors before the server would ever reject.

import type { ReactNode } from "react";
import { fmt } from "@/lib/i18n";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import { venueSr } from "@/lib/i18n/sr/venue";
import {
  GALLERY_MAX_ITEMS,
  PRICE_LIST_MAX_ITEMS,
  PROGRAM_MAX_ITEMS,
  RESERVATION_MAX_ZONES,
  VENUE_BLOCK_BOUNDS,
  type GalleryProps,
  type PriceListProps,
  type ProfileCardsProps,
  type ProgramTimelineProps,
  type ShareProps,
  type VenueBlock,
  type VenueBlockType,
} from "@/lib/venue-blocks";
import type { VenueBlockEditorPanelProps } from "@/components/venue/blocks/registry";
import { BlockBaseSection } from "./venue-editor-base-section";
import {
  BoundedSlider,
  DateTimeField,
  formatPlain,
  NumberField,
  Segmented,
  SubHeading,
  TextAreaField,
  TextField,
  ToggleRow,
} from "./venue-editor-fields";
import { EditableItemList } from "./venue-editor-item-list";
import { MediaUploadTile } from "./venue-editor-upload";
import styles from "./venue-editor.module.css";

// Per-panel props patcher with history grouping. A plain closure factory, not
// a hook — panels call it after narrowing the block type.
function makeBlockPatch<B extends VenueBlock>(
  block: B,
  onChange: (next: VenueBlock, group?: string) => void,
) {
  return (partial: Partial<B["props"]>, property?: string) =>
    onChange(
      { ...block, props: { ...block.props, ...partial } } as VenueBlock,
      property ? `${block.base.id}:${property}` : undefined,
    );
}

function HeadingField({
  value,
  fallback,
  onPatch,
}: {
  value: string | undefined;
  fallback: string;
  onPatch: (heading: string | undefined) => void;
}) {
  return (
    <TextField
      label={dict.headingLabel}
      value={value ?? ""}
      placeholder={fmt(dict.headingPlaceholder, { fallback })}
      maxLength={80}
      onChange={(next) => onPatch(next.trim() === "" ? undefined : next)}
    />
  );
}

// ---------------------------------------------------------------- countdown

function CountdownPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "countdown") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const custom = typeof props.target === "object";

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <Segmented
        label={dict.countdownTargetLabel}
        value={custom ? "custom" : "eventStart"}
        options={[
          { value: "eventStart", label: dict.countdownTargetEvent },
          { value: "custom", label: dict.countdownTargetCustom },
        ]}
        onChange={(target) =>
          patch({
            target:
              target === "eventStart"
                ? "eventStart"
                : {
                    kind: "custom",
                    timestamp:
                      typeof props.target === "object"
                        ? props.target.timestamp
                        : Date.now() + 7 * 86_400_000,
                  },
          })
        }
      />
      {typeof props.target === "object" ? (
        <DateTimeField
          label={dict.countdownCustomTimeLabel}
          value={props.target.timestamp}
          onChange={(timestamp) =>
            patch(
              {
                target: {
                  kind: "custom",
                  timestamp: timestamp ?? Date.now() + 7 * 86_400_000,
                },
              },
              "countdown-target",
            )
          }
        />
      ) : null}
      <SubHeading>{dict.countdownUnitsLabel}</SubHeading>
      {(
        [
          ["days", dict.unitDays],
          ["hours", dict.unitHours],
          ["minutes", dict.unitMinutes],
          ["seconds", dict.unitSeconds],
        ] as const
      ).map(([unit, label]) => (
        <ToggleRow
          key={unit}
          label={label}
          checked={props.units[unit]}
          onChange={(checked) =>
            patch({ units: { ...props.units, [unit]: checked } })
          }
        />
      ))}
      <Segmented
        label={dict.countdownStyleLabel}
        value={props.style}
        options={[
          { value: "digits", label: dict.countdownStyleDigits },
          { value: "cards", label: dict.countdownStyleCards },
          { value: "minimal", label: dict.countdownStyleMinimal },
        ]}
        onChange={(style) => patch({ style })}
      />
      <Segmented
        label={dict.countdownDoneLabel}
        value={props.completedBehavior}
        options={[
          { value: "hide", label: dict.countdownDoneHide },
          { value: "message", label: dict.countdownDoneMessage },
        ]}
        onChange={(completedBehavior) => patch({ completedBehavior })}
      />
      {props.completedBehavior === "message" ? (
        <TextField
          label={dict.countdownMessageLabel}
          value={props.completedMessage ?? ""}
          maxLength={160}
          onChange={(next) =>
            patch(
              { completedMessage: next.trim() === "" ? undefined : next },
              "countdown-message",
            )
          }
        />
      ) : null}
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ------------------------------------------------------------ eventDateTime

function EventDateTimePanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "eventDateTime") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const orderError =
    props.startsAt !== undefined &&
    props.endsAt !== undefined &&
    props.startsAt >= props.endsAt
      ? dict.dtOrderError
      : null;

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <DateTimeField
        label={dict.dtStartLabel}
        value={props.startsAt}
        hint={dict.dtInheritNote}
        onChange={(startsAt) => patch({ startsAt }, "dt-start")}
      />
      <DateTimeField
        label={dict.dtEndLabel}
        value={props.endsAt}
        error={orderError}
        onChange={(endsAt) => patch({ endsAt }, "dt-end")}
      />
      <TextField
        label={dict.dtVenueNameLabel}
        value={props.venueName ?? ""}
        maxLength={120}
        onChange={(next) =>
          patch({ venueName: next.trim() === "" ? undefined : next }, "dt-venue")
        }
      />
      <TextField
        label={dict.dtAddressLabel}
        value={props.address ?? ""}
        maxLength={160}
        onChange={(next) =>
          patch({ address: next.trim() === "" ? undefined : next }, "dt-address")
        }
      />
      <ToggleRow
        label={dict.dtShowCalendarLabel}
        checked={props.showAddToCalendar}
        onChange={(showAddToCalendar) => patch({ showAddToCalendar })}
      />
      {props.showAddToCalendar ? (
        <>
          <ToggleRow
            label={dict.dtGoogleLabel}
            checked={props.googleCalendarLink}
            onChange={(googleCalendarLink) => patch({ googleCalendarLink })}
          />
          <ToggleRow
            label={dict.dtIcsLabel}
            checked={props.icsDownload}
            onChange={(icsDownload) => patch({ icsDownload })}
          />
        </>
      ) : null}
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------- programTimeline

function ProgramTimelinePanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "programTimeline") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const setItems = (items: ProgramTimelineProps["items"]) => patch({ items });

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <HeadingField
        value={props.heading}
        fallback={venueSr.programHeading}
        onPatch={(heading) => patch({ heading }, "heading")}
      />
      <Segmented
        label={dict.programLayoutLabel}
        value={props.layout}
        options={[
          { value: "timeline", label: dict.programLayoutTimeline },
          { value: "list", label: dict.programLayoutList },
          { value: "grid", label: dict.programLayoutGrid },
        ]}
        onChange={(layout) => patch({ layout })}
      />
      <ToggleRow
        label={dict.programShowTimes}
        checked={props.showTimes}
        onChange={(showTimes) => patch({ showTimes })}
      />
      <EditableItemList
        heading={dict.programItemsHeading}
        items={props.items}
        onItemsChange={setItems}
        itemName={(item) => item.title}
        addLabel={dict.programAddItem}
        cap={{ count: props.items.length, max: PROGRAM_MAX_ITEMS }}
        onAdd={() =>
          setItems([
            ...props.items,
            { id: crypto.randomUUID(), title: "" },
          ])
        }
        renderItem={(item) => (
          <>
            <TextField
              label={dict.programItemTitleLabel}
              value={item.title}
              maxLength={120}
              error={item.title.trim() === "" ? dict.requiredFieldError : null}
              onChange={(title) =>
                setItemPatch(props.items, setItems, item.id, { title })
              }
            />
            <TextField
              label={dict.programItemSubtitleLabel}
              value={item.subtitle ?? ""}
              maxLength={160}
              onChange={(next) =>
                setItemPatch(props.items, setItems, item.id, {
                  subtitle: next.trim() === "" ? undefined : next,
                })
              }
            />
            <DateTimeField
              label={dict.programItemTimeLabel}
              value={item.startsAt}
              onChange={(startsAt) =>
                setItemPatch(props.items, setItems, item.id, { startsAt })
              }
            />
            <MediaUploadTile
              kind="image"
              storageId={item.imageStorageId}
              onUploaded={(imageStorageId) =>
                setItemPatch(props.items, setItems, item.id, { imageStorageId })
              }
              onRemove={() =>
                setItemPatch(props.items, setItems, item.id, {
                  imageStorageId: undefined,
                })
              }
            />
          </>
        )}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

function setItemPatch<T extends { id: string }>(
  items: readonly T[],
  commit: (next: T[]) => void,
  id: string,
  partial: Partial<T>,
) {
  commit(
    items.map((item) => (item.id === id ? { ...item, ...partial } : item)),
  );
}

// ------------------------------------------------------------------- map

function MapPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "map") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const coords =
    props.location.kind === "coords"
      ? props.location
      : { kind: "coords" as const, lat: 44.8125, lng: 20.4612 };

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <Segmented
        label={dict.mapKindLabel}
        value={props.location.kind}
        options={[
          { value: "address", label: dict.mapKindAddress },
          { value: "coords", label: dict.mapKindCoords },
        ]}
        onChange={(kind) =>
          patch({
            location:
              kind === "address"
                ? {
                    kind: "address",
                    address:
                      props.location.kind === "address"
                        ? props.location.address
                        : "",
                  }
                : coords,
          })
        }
      />
      {props.location.kind === "address" ? (
        <TextField
          label={dict.mapAddressLabel}
          value={props.location.address}
          maxLength={200}
          error={
            props.location.address.trim() === "" ? dict.requiredFieldError : null
          }
          onChange={(address) =>
            patch({ location: { kind: "address", address } }, "map-address")
          }
        />
      ) : (
        <>
          <NumberField
            label={dict.mapLatLabel}
            value={props.location.lat}
            min={-90}
            max={90}
            step={0.000001}
            onChange={(lat) =>
              lat !== "" &&
              patch({ location: { ...coords, lat } }, "map-coords")
            }
          />
          <NumberField
            label={dict.mapLngLabel}
            value={props.location.lng}
            min={-180}
            max={180}
            step={0.000001}
            onChange={(lng) =>
              lng !== "" &&
              patch({ location: { ...coords, lng } }, "map-coords")
            }
          />
        </>
      )}
      <BoundedSlider
        label={dict.mapZoomLabel}
        value={props.zoom}
        bounds={VENUE_BLOCK_BOUNDS.mapZoom}
        format={formatPlain}
        onChange={(zoom) => patch({ zoom }, "map-zoom")}
      />
      <TextField
        label={dict.mapPinLabel}
        value={props.pinLabel ?? ""}
        maxLength={120}
        onChange={(next) =>
          patch({ pinLabel: next.trim() === "" ? undefined : next }, "map-pin")
        }
      />
      <Segmented
        label={dict.mapDisplayLabel}
        value={props.display}
        options={[
          { value: "static", label: dict.mapDisplayStatic },
          { value: "embed", label: dict.mapDisplayEmbed },
        ]}
        onChange={(display) => patch({ display })}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ----------------------------------------------------------------- gallery

function GalleryPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "gallery") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const setItems = (items: GalleryProps["items"]) => patch({ items });

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <Segmented
        label={dict.galleryLayoutLabel}
        value={props.layout}
        options={[
          { value: "grid", label: dict.galleryLayoutGrid },
          { value: "masonry", label: dict.galleryLayoutMasonry },
          { value: "carousel", label: dict.galleryLayoutCarousel },
        ]}
        onChange={(layout) => patch({ layout })}
      />
      <BoundedSlider
        label={dict.galleryColumnsLabel}
        value={props.columns}
        bounds={VENUE_BLOCK_BOUNDS.galleryColumns}
        format={formatPlain}
        onChange={(columns) => patch({ columns }, "gallery-columns")}
      />
      <BoundedSlider
        label={dict.galleryGapLabel}
        value={props.gap}
        bounds={VENUE_BLOCK_BOUNDS.galleryGap}
        onChange={(gap) => patch({ gap }, "gallery-gap")}
      />
      <Segmented
        label={dict.galleryAspectLabel}
        value={props.aspect}
        options={[
          { value: "original", label: dict.aspectOriginal },
          { value: "square", label: dict.aspectSquare },
          { value: "landscape", label: dict.aspectLandscape },
        ]}
        onChange={(aspect) => patch({ aspect })}
      />
      <ToggleRow
        label={dict.galleryLightboxLabel}
        checked={props.lightbox}
        onChange={(lightbox) => patch({ lightbox })}
      />
      <EditableItemList
        heading={dict.galleryItemsHeading}
        items={props.items}
        onItemsChange={setItems}
        itemName={(item) => item.caption ?? item.alt ?? ""}
        addLabel={dict.galleryAddImage}
        cap={{ count: props.items.length, max: GALLERY_MAX_ITEMS }}
        addControl={
          // A gallery item cannot exist without its image (the model requires
          // storageId), so "add" IS an upload. The list hides this tile at the
          // 24-item cap and shows the written reason instead.
          <MediaUploadTile
            kind="image"
            storageId={undefined}
            label={dict.galleryAddImage}
            onUploaded={(storageId) =>
              setItems([
                ...props.items,
                { id: crypto.randomUUID(), storageId },
              ])
            }
          />
        }
        renderItem={(item) => (
          <>
            <MediaUploadTile
              kind="image"
              storageId={item.storageId}
              onUploaded={(storageId) =>
                setItemPatch(props.items, setItems, item.id, { storageId })
              }
            />
            <TextField
              label={dict.galleryAltLabel}
              value={item.alt ?? ""}
              maxLength={160}
              onChange={(next) =>
                setItemPatch(props.items, setItems, item.id, {
                  alt: next.trim() === "" ? undefined : next,
                })
              }
            />
            <TextField
              label={dict.galleryCaptionLabel}
              value={item.caption ?? ""}
              maxLength={160}
              onChange={(next) =>
                setItemPatch(props.items, setItems, item.id, {
                  caption: next.trim() === "" ? undefined : next,
                })
              }
            />
          </>
        )}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ------------------------------------------------------------ profileCards

function ProfileCardsPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "profileCards") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const setItems = (items: ProfileCardsProps["items"]) => patch({ items });

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <HeadingField
        value={props.heading}
        fallback={venueSr.profileCardsHeading}
        onPatch={(heading) => patch({ heading }, "heading")}
      />
      <Segmented
        label={dict.profileLayoutLabel}
        value={props.layout}
        options={[
          { value: "grid", label: dict.profileLayoutGrid },
          { value: "list", label: dict.profileLayoutList },
        ]}
        onChange={(layout) => patch({ layout })}
      />
      {props.layout === "grid" ? (
        <BoundedSlider
          label={dict.profileColumnsLabel}
          value={props.columns}
          bounds={VENUE_BLOCK_BOUNDS.profileColumns}
          format={formatPlain}
          onChange={(columns) => patch({ columns }, "profile-columns")}
        />
      ) : null}
      <EditableItemList
        heading={dict.profileItemsHeading}
        items={props.items}
        onItemsChange={setItems}
        itemName={(item) => item.name}
        addLabel={dict.profileAddItem}
        onAdd={() =>
          setItems([...props.items, { id: crypto.randomUUID(), name: "" }])
        }
        renderItem={(item) => {
          const linkInvalid =
            item.link !== undefined &&
            item.link !== "" &&
            !item.link.startsWith("https://");
          return (
            <>
              <TextField
                label={dict.profileNameLabel}
                value={item.name}
                maxLength={120}
                error={item.name.trim() === "" ? dict.requiredFieldError : null}
                onChange={(name) =>
                  setItemPatch(props.items, setItems, item.id, { name })
                }
              />
              <TextField
                label={dict.profileRoleLabel}
                value={item.role ?? ""}
                maxLength={120}
                onChange={(next) =>
                  setItemPatch(props.items, setItems, item.id, {
                    role: next.trim() === "" ? undefined : next,
                  })
                }
              />
              <TextField
                label={dict.profileLinkLabel}
                type="url"
                value={item.link ?? ""}
                error={linkInvalid ? dict.profileLinkError : null}
                onChange={(next) =>
                  setItemPatch(props.items, setItems, item.id, {
                    link: next.trim() === "" ? undefined : next,
                  })
                }
              />
              <MediaUploadTile
                kind="image"
                storageId={item.imageStorageId}
                onUploaded={(imageStorageId) =>
                  setItemPatch(props.items, setItems, item.id, {
                    imageStorageId,
                  })
                }
                onRemove={() =>
                  setItemPatch(props.items, setItems, item.id, {
                    imageStorageId: undefined,
                  })
                }
              />
            </>
          );
        }}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// --------------------------------------------------------------- priceList

function PriceListPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "priceList") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const totalItems = props.sections.reduce(
    (sum, section) => sum + section.items.length,
    0,
  );
  const atTotalCap = totalItems >= PRICE_LIST_MAX_ITEMS;
  const setSections = (sections: PriceListProps["sections"]) =>
    patch({ sections });

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <HeadingField
        value={props.heading}
        fallback={venueSr.priceListHeading}
        onPatch={(heading) => patch({ heading }, "heading")}
      />
      <TextField
        label={dict.priceCurrencyLabel}
        value={props.currency}
        maxLength={6}
        error={props.currency.trim() === "" ? dict.requiredFieldError : null}
        onChange={(currency) => patch({ currency }, "price-currency")}
      />
      <p className={styles.capSummary} role="status">
        {fmt(dict.priceTotalCount, {
          count: totalItems,
          max: PRICE_LIST_MAX_ITEMS,
        })}
      </p>
      <EditableItemList
        heading={dict.priceSectionsHeading}
        items={props.sections}
        onItemsChange={setSections}
        itemName={(section) => section.title}
        addLabel={dict.priceAddSection}
        onAdd={() =>
          setSections([
            ...props.sections,
            { id: crypto.randomUUID(), title: "", items: [] },
          ])
        }
        renderItem={(section) => (
          <>
            <TextField
              label={dict.priceSectionTitleLabel}
              value={section.title}
              maxLength={80}
              error={section.title.trim() === "" ? dict.requiredFieldError : null}
              onChange={(title) =>
                setItemPatch(props.sections, setSections, section.id, { title })
              }
            />
            <EditableItemList
              heading={dict.contentSectionHeading}
              items={section.items}
              onItemsChange={(items) =>
                setItemPatch(props.sections, setSections, section.id, { items })
              }
              itemName={(item) => item.name}
              addLabel={dict.priceAddItem}
              addDisabled={atTotalCap}
              capNotice={fmt(dict.itemCapReached, { max: PRICE_LIST_MAX_ITEMS })}
              onAdd={() =>
                setItemPatch(props.sections, setSections, section.id, {
                  items: [
                    ...section.items,
                    { id: crypto.randomUUID(), name: "" },
                  ],
                })
              }
              renderItem={(item) => (
                <>
                  <TextField
                    label={dict.priceItemNameLabel}
                    value={item.name}
                    maxLength={120}
                    error={
                      item.name.trim() === "" ? dict.requiredFieldError : null
                    }
                    onChange={(name) =>
                      setItemPatch(section.items, (items) =>
                        setItemPatch(props.sections, setSections, section.id, {
                          items,
                        }),
                      item.id, { name })
                    }
                  />
                  <TextField
                    label={dict.priceItemDescriptionLabel}
                    value={item.description ?? ""}
                    maxLength={200}
                    onChange={(next) =>
                      setItemPatch(section.items, (items) =>
                        setItemPatch(props.sections, setSections, section.id, {
                          items,
                        }),
                      item.id, {
                        description: next.trim() === "" ? undefined : next,
                      })
                    }
                  />
                  <NumberField
                    label={dict.priceItemPriceLabel}
                    value={item.price ?? ""}
                    min={0}
                    max={100_000_000}
                    onChange={(price) =>
                      setItemPatch(section.items, (items) =>
                        setItemPatch(props.sections, setSections, section.id, {
                          items,
                        }),
                      item.id, { price: price === "" ? undefined : price })
                    }
                  />
                </>
              )}
            />
          </>
        )}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ------------------------------------------------------------- reservation

function ReservationPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "reservation") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;
  const zones = props.zones ?? [];

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <HeadingField
        value={props.heading}
        fallback={venueSr.reservationHeading}
        onPatch={(heading) => patch({ heading }, "heading")}
      />
      <SubHeading>{dict.resFieldsHeading}</SubHeading>
      {(
        [
          ["name", dict.resFieldName],
          ["phone", dict.resFieldPhone],
          ["email", dict.resFieldEmail],
          ["partySize", dict.resFieldPartySize],
          ["note", dict.resFieldNote],
        ] as const
      ).map(([field, label]) => (
        <ToggleRow
          key={field}
          label={label}
          checked={props.fields[field]}
          onChange={(checked) =>
            patch({ fields: { ...props.fields, [field]: checked } })
          }
        />
      ))}
      {/* TASK-43 — zones: areas with a unit count ("Sto za dvoje — 8 komada"),
          never numbered tables. With zones present the legacy whole-event
          capacity is ignored, so its toggle hides to keep one editable place
          per fact. */}
      <SubHeading>{dict.resZonesHeading}</SubHeading>
      <p className={styles.fieldHint}>{dict.resZonesNote}</p>
      {zones.map((zone) => (
        <div key={zone.id} className={styles.zoneRow}>
          <TextField
            label={dict.resZoneNameLabel}
            value={zone.name}
            placeholder={dict.resZoneNamePlaceholder}
            maxLength={60}
            onChange={(name) =>
              patch(
                {
                  zones: zones.map((candidate) =>
                    candidate.id === zone.id ? { ...candidate, name } : candidate,
                  ),
                },
                `zone-name-${zone.id}`,
              )
            }
          />
          <NumberField
            label={dict.resZoneCapacityLabel}
            value={zone.capacity}
            min={VENUE_BLOCK_BOUNDS.zoneCapacity[0]}
            max={VENUE_BLOCK_BOUNDS.zoneCapacity[1]}
            onChange={(capacity) =>
              capacity !== "" &&
              patch(
                {
                  zones: zones.map((candidate) =>
                    candidate.id === zone.id
                      ? { ...candidate, capacity }
                      : candidate,
                  ),
                },
                `zone-capacity-${zone.id}`,
              )
            }
          />
          <button
            type="button"
            className={styles.blockRowAction}
            data-tone="danger"
            aria-label={fmt(dict.resZoneRemoveAria, {
              name: zone.name || dict.resZoneNamePlaceholder,
            })}
            onClick={() =>
              patch({
                zones: zones.filter((candidate) => candidate.id !== zone.id),
              })
            }
          >
            ×
          </button>
        </div>
      ))}
      {zones.length < RESERVATION_MAX_ZONES ? (
        <button
          type="button"
          className={styles.itemAddButton}
          onClick={() =>
            patch({
              zones: [
                ...zones,
                { id: crypto.randomUUID(), name: "", capacity: 8 },
              ],
            })
          }
        >
          {dict.resZoneAdd}
        </button>
      ) : null}
      {zones.length === 0 ? (
        <>
          <ToggleRow
            label={dict.resCapacityToggle}
            checked={props.capacity !== undefined}
            onChange={(on) => patch({ capacity: on ? 100 : undefined })}
          />
          {props.capacity !== undefined ? (
            <NumberField
              label={dict.resCapacityLabel}
              value={props.capacity}
              min={VENUE_BLOCK_BOUNDS.capacity[0]}
              max={VENUE_BLOCK_BOUNDS.capacity[1]}
              onChange={(capacity) =>
                capacity !== "" && patch({ capacity }, "res-capacity")
              }
            />
          ) : null}
        </>
      ) : null}
      <ToggleRow
        label={dict.resDeadlineToggle}
        checked={props.deadline !== undefined}
        onChange={(on) =>
          patch({ deadline: on ? Date.now() + 3 * 86_400_000 : undefined })
        }
      />
      {props.deadline !== undefined ? (
        <DateTimeField
          label={dict.resDeadlineLabel}
          value={props.deadline}
          onChange={(deadline) =>
            patch(
              { deadline: deadline ?? undefined },
              "res-deadline",
            )
          }
        />
      ) : null}
      <TextAreaField
        label={dict.resConfirmationLabel}
        value={props.confirmationMessage ?? ""}
        rows={3}
        onChange={(next) =>
          patch(
            { confirmationMessage: next.trim() === "" ? undefined : next },
            "res-confirmation",
          )
        }
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ------------------------------------------------------------------ share

const SHARE_CHANNEL_ORDER: ShareProps["channels"] = [
  "whatsapp",
  "viber",
  "facebook",
  "x",
  "copy",
];
const SHARE_CHANNEL_LABELS: Record<ShareProps["channels"][number], string> = {
  whatsapp: dict.channelWhatsapp,
  viber: dict.channelViber,
  facebook: dict.channelFacebook,
  x: dict.channelX,
  copy: dict.channelCopy,
};

function SharePanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "share") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <HeadingField
        value={props.heading}
        fallback={venueSr.shareHeading}
        onPatch={(heading) => patch({ heading }, "heading")}
      />
      <SubHeading>{dict.shareChannelsHeading}</SubHeading>
      {SHARE_CHANNEL_ORDER.map((channel) => (
        <ToggleRow
          key={channel}
          label={SHARE_CHANNEL_LABELS[channel]}
          checked={props.channels.includes(channel)}
          onChange={(checked) =>
            patch({
              channels: SHARE_CHANNEL_ORDER.filter((other) =>
                other === channel
                  ? checked
                  : props.channels.includes(other),
              ),
            })
          }
        />
      ))}
      <TextAreaField
        label={dict.shareMessageLabel}
        value={props.message ?? ""}
        rows={3}
        onChange={(next) =>
          patch(
            { message: next.trim() === "" ? undefined : next },
            "share-message",
          )
        }
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ------------------------------------------------------------- pastEvents

function PastEventsPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "pastEvents") return null;
  const patch = makeBlockPatch(block, onChange);
  const props = block.props;

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <HeadingField
        value={props.heading}
        fallback={venueSr.pastEventsHeading}
        onPatch={(heading) => patch({ heading }, "heading")}
      />
      <Segmented
        label={dict.pastLayoutLabel}
        value={props.layout}
        options={[
          { value: "grid", label: dict.pastLayoutGrid },
          { value: "list", label: dict.pastLayoutList },
        ]}
        onChange={(layout) => patch({ layout })}
      />
      <BoundedSlider
        label={dict.pastLimitLabel}
        value={props.limit}
        bounds={VENUE_BLOCK_BOUNDS.pastEventsLimit}
        format={formatPlain}
        onChange={(limit) => patch({ limit }, "past-limit")}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// --------------------------------------------------------------- richText

function RichTextPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "richText") return null;
  const patch = makeBlockPatch(block, onChange);

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <TextAreaField
        label={dict.richTextLabel}
        value={block.props.content}
        hint={dict.richTextHint}
        rows={8}
        onChange={(content) => patch({ content }, "richtext-content")}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ----------------------------------------------------------------- spacer

function SpacerPanel({ block, onChange }: VenueBlockEditorPanelProps) {
  if (block.type !== "spacer") return null;
  const patch = makeBlockPatch(block, onChange);

  return (
    <div className={styles.panelForm}>
      <SubHeading>{dict.contentSectionHeading}</SubHeading>
      <BoundedSlider
        label={dict.spacerHeightLabel}
        value={block.props.height}
        bounds={VENUE_BLOCK_BOUNDS.spacerHeight}
        onChange={(height) => patch({ height }, "spacer-height")}
      />
      <ToggleRow
        label={dict.spacerDividerLabel}
        checked={block.props.divider}
        onChange={(divider) => patch({ divider })}
      />
      <BlockBaseSection block={block} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The editor-side panel map: the registry's EditorPanel seam, filled here so
// the public render path (which imports the registry) never bundles a panel.
// ---------------------------------------------------------------------------

export const VENUE_BLOCK_EDITOR_PANELS: Record<
  VenueBlockType,
  (props: VenueBlockEditorPanelProps) => ReactNode
> = {
  countdown: CountdownPanel,
  eventDateTime: EventDateTimePanel,
  programTimeline: ProgramTimelinePanel,
  map: MapPanel,
  gallery: GalleryPanel,
  profileCards: ProfileCardsPanel,
  priceList: PriceListPanel,
  reservation: ReservationPanel,
  share: SharePanel,
  pastEvents: PastEventsPanel,
  richText: RichTextPanel,
  spacer: SpacerPanel,
};
