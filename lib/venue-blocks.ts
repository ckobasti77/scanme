// The Venue block model as pure data + rules (RFC-001 §2.4 C.2, §2.5 — STEP 2
// of TASK-07): block types, `defaults(type)`, and `clamp(block)`, with **no
// Convex imports**, so `convex/venue.ts` can import them and normalize on write
// exactly the way `convex/scanMeLinks.ts` imports `lib/scanme-links-design.ts`
// and calls `normalizeDesignForPreset`.
//
// The TS shapes here mirror the validators in convex/lib/venueValidators.ts.
// Their agreement is proven by the test that inserts every `defaults(type)`
// into the real `venueEventConfigs` schema (the same hand-kept validator↔type
// pairing the RFC §1.a documents for Links).

import type { DesignFontKey } from "./design-engine/typography";

// ---------------------------------------------------------------------------
// Shared design leaf types (identical shape to designEngineValidators.ts)
// ---------------------------------------------------------------------------

type DesignWeight = 400 | 500 | 600 | 700;
type DesignScale = "small" | "medium" | "large";
type DesignShadow = {
  enabled: boolean;
  color: string;
  x: number;
  y: number;
  blur: number;
  opacity: number;
};

// ---------------------------------------------------------------------------
// Per-block base — mirrors `blockBaseValidator`
// ---------------------------------------------------------------------------

export type VenueBlockBase = {
  id: string;
  visible: boolean;
  responsive?: { desktop: boolean; mobile: boolean };
  size?: "full" | "wide" | "narrow";
  alignment?: "left" | "center" | "right";
  spacing?: { top: number; bottom: number };
  radius?: number;
  border?: { width: number; color: string };
  shadow?: DesignShadow;
  surface?: "none" | "card" | { kind: "custom"; color: string };
  colorOverride?: { title?: string; body?: string; accent?: string };
  typographyOverride?: {
    fontKey?: DesignFontKey;
    headingWeight?: DesignWeight;
    bodyWeight?: DesignWeight;
    scale?: DesignScale;
  };
  animation?: "none" | "fade-up" | "reveal";
};

// ---------------------------------------------------------------------------
// Per-block props — mirror the validators in venueValidators.ts
// ---------------------------------------------------------------------------

export type CountdownProps = {
  target: "eventStart" | { kind: "custom"; timestamp: number };
  units: { days: boolean; hours: boolean; minutes: boolean; seconds: boolean };
  style: "digits" | "cards" | "minimal";
  completedBehavior: "hide" | "message";
  completedMessage?: string;
};

export type EventDateTimeProps = {
  startsAt?: number;
  endsAt?: number;
  venueName?: string;
  address?: string;
  showAddToCalendar: boolean;
  googleCalendarLink: boolean;
  icsDownload: boolean;
};

export type ProgramTimelineProps = {
  heading?: string;
  layout: "timeline" | "list" | "grid";
  showTimes: boolean;
  items: Array<{
    id: string;
    startsAt?: number;
    title: string;
    subtitle?: string;
    imageStorageId?: string;
  }>;
};

export type MapProps = {
  location:
    | { kind: "address"; address: string }
    | { kind: "coords"; lat: number; lng: number };
  zoom: number;
  pinLabel?: string;
  display: "static" | "embed";
};

export type GalleryProps = {
  layout: "grid" | "masonry" | "carousel";
  columns: number;
  gap: number;
  aspect: "original" | "square" | "landscape";
  lightbox: boolean;
  items: Array<{
    id: string;
    storageId: string;
    alt?: string;
    caption?: string;
  }>;
};

export type ProfileCardsProps = {
  heading?: string;
  layout: "grid" | "list";
  columns: number;
  items: Array<{
    id: string;
    name: string;
    role?: string;
    imageStorageId?: string;
    link?: string;
  }>;
};

// "priceList", deliberately not "menu": ScanMe Menu is a planned separate
// product (RFC-001 §2.5) and Venue must not squat its name. This block is a
// light convenience list of a few priced items on a campaign page.
export type PriceListProps = {
  heading?: string;
  currency: string;
  sections: Array<{
    id: string;
    title: string;
    items: Array<{
      id: string;
      name: string;
      description?: string;
      price?: number;
    }>;
  }>;
};

export type ReservationProps = {
  heading?: string;
  fields: {
    name: boolean;
    phone: boolean;
    email: boolean;
    partySize: boolean;
    note: boolean;
  };
  capacity?: number;
  deadline?: number;
  confirmationMessage?: string;
};

export type ShareProps = {
  heading?: string;
  channels: Array<"whatsapp" | "viber" | "facebook" | "x" | "copy">;
  message?: string;
};

export type PastEventsProps = {
  heading?: string;
  layout: "grid" | "list";
  limit: number;
};

export type RichTextProps = { content: string };

export type SpacerProps = { height: number; divider: boolean };

// ---------------------------------------------------------------------------
// The discriminated block union — exactly the twelve §2.5 types
// ---------------------------------------------------------------------------

export type VenueBlock =
  | { type: "countdown"; base: VenueBlockBase; props: CountdownProps }
  | { type: "eventDateTime"; base: VenueBlockBase; props: EventDateTimeProps }
  | { type: "programTimeline"; base: VenueBlockBase; props: ProgramTimelineProps }
  | { type: "map"; base: VenueBlockBase; props: MapProps }
  | { type: "gallery"; base: VenueBlockBase; props: GalleryProps }
  | { type: "profileCards"; base: VenueBlockBase; props: ProfileCardsProps }
  | { type: "priceList"; base: VenueBlockBase; props: PriceListProps }
  | { type: "reservation"; base: VenueBlockBase; props: ReservationProps }
  | { type: "share"; base: VenueBlockBase; props: ShareProps }
  | { type: "pastEvents"; base: VenueBlockBase; props: PastEventsProps }
  | { type: "richText"; base: VenueBlockBase; props: RichTextProps }
  | { type: "spacer"; base: VenueBlockBase; props: SpacerProps };

export type VenueBlockType = VenueBlock["type"];

export const VENUE_BLOCK_TYPES = [
  "countdown",
  "eventDateTime",
  "programTimeline",
  "map",
  "gallery",
  "profileCards",
  "priceList",
  "reservation",
  "share",
  "pastEvents",
  "richText",
  "spacer",
] as const;

// ---------------------------------------------------------------------------
// Caps (RFC §2.4 C.2) and numeric bounds
// ---------------------------------------------------------------------------

export const MAX_BLOCKS = 30;
export const GALLERY_MAX_ITEMS = 24;
export const PROGRAM_MAX_ITEMS = 40;
export const PRICE_LIST_MAX_ITEMS = 60;
// The most Memories photos a host may pin into one event's archive (TASK-23).
// One constant so the host picker's UI and the server mutation agree on the cap.
export const ARCHIVE_MAX_ITEMS = 60;

// Inclusive numeric ranges for bounded properties. Chosen as the smallest
// reasonable defaults where the RFC makes no decision (listed in the report).
//
// EXPORTED as the single source both `clamp()` below and every editor control
// read (TASK-12 constrained freedom): a slider's min/max must be DERIVED from
// the same constant the server clamps with — a retyped copy would drift.
export const VENUE_BLOCK_BOUNDS = {
  radius: [0, 120],
  spacing: [0, 200],
  borderWidth: [0, 24],
  galleryColumns: [1, 4],
  galleryGap: [0, 64],
  profileColumns: [1, 4],
  mapZoom: [1, 21],
  pastEventsLimit: [1, 24],
  spacerHeight: [0, 400],
  capacity: [0, 100000],
  // Per-block shadow geometry — clamped in clampBase so the editor's shadow
  // sliders and the server agree on the reachable range.
  shadowOffset: [-40, 40],
  shadowBlur: [0, 80],
  shadowOpacity: [0, 1],
} as const satisfies Record<string, readonly [number, number]>;

const RADIUS_RANGE = VENUE_BLOCK_BOUNDS.radius;
const SPACING_RANGE = VENUE_BLOCK_BOUNDS.spacing;
const BORDER_WIDTH_RANGE = VENUE_BLOCK_BOUNDS.borderWidth;
const GALLERY_COLUMNS_RANGE = VENUE_BLOCK_BOUNDS.galleryColumns;
const GALLERY_GAP_RANGE = VENUE_BLOCK_BOUNDS.galleryGap;
const PROFILE_COLUMNS_RANGE = VENUE_BLOCK_BOUNDS.profileColumns;
const MAP_ZOOM_RANGE = VENUE_BLOCK_BOUNDS.mapZoom;
const PAST_EVENTS_LIMIT_RANGE = VENUE_BLOCK_BOUNDS.pastEventsLimit;
const SPACER_HEIGHT_RANGE = VENUE_BLOCK_BOUNDS.spacerHeight;
const CAPACITY_RANGE = VENUE_BLOCK_BOUNDS.capacity;

const clampNum = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------------------
// defaults(type) — a fresh, valid block of each type. `base.id` is left empty
// for the caller (mutation/editor) to assign a uuid.
// ---------------------------------------------------------------------------

function baseDefaults(): VenueBlockBase {
  return { id: "", visible: true };
}

export function defaults(type: VenueBlockType): VenueBlock {
  const base = baseDefaults();
  switch (type) {
    case "countdown":
      return {
        type,
        base,
        props: {
          target: "eventStart",
          units: { days: true, hours: true, minutes: true, seconds: true },
          style: "digits",
          completedBehavior: "hide",
        },
      };
    case "eventDateTime":
      return {
        type,
        base,
        props: {
          showAddToCalendar: true,
          googleCalendarLink: true,
          icsDownload: true,
        },
      };
    case "programTimeline":
      return {
        type,
        base,
        props: { layout: "timeline", showTimes: true, items: [] },
      };
    case "map":
      return {
        type,
        base,
        props: {
          location: { kind: "address", address: "" },
          zoom: 15,
          display: "static",
        },
      };
    case "gallery":
      return {
        type,
        base,
        props: {
          layout: "grid",
          columns: 3,
          gap: 8,
          aspect: "original",
          lightbox: true,
          items: [],
        },
      };
    case "profileCards":
      return {
        type,
        base,
        props: { layout: "grid", columns: 3, items: [] },
      };
    case "priceList":
      return {
        type,
        base,
        props: { currency: "RSD", sections: [] },
      };
    case "reservation":
      return {
        type,
        base,
        props: {
          fields: {
            name: true,
            phone: true,
            email: false,
            partySize: true,
            note: false,
          },
        },
      };
    case "share":
      return {
        type,
        base,
        props: { channels: ["whatsapp", "viber", "copy"] },
      };
    case "pastEvents":
      return {
        type,
        base,
        props: { layout: "grid", limit: 6 },
      };
    case "richText":
      return { type, base, props: { content: "" } };
    case "spacer":
      return { type, base, props: { height: 32, divider: false } };
  }
}

// ---------------------------------------------------------------------------
// clamp(block) — enforces per-block caps and numeric ranges. Idempotent:
// clamp(clamp(x)) === clamp(x). Block-count is enforced by clampBlockList.
// ---------------------------------------------------------------------------

function clampBase(base: VenueBlockBase): VenueBlockBase {
  const next: VenueBlockBase = { ...base };
  if (next.radius !== undefined) {
    next.radius = clampNum(next.radius, ...RADIUS_RANGE);
  }
  if (next.spacing) {
    next.spacing = {
      top: clampNum(next.spacing.top, ...SPACING_RANGE),
      bottom: clampNum(next.spacing.bottom, ...SPACING_RANGE),
    };
  }
  if (next.border) {
    next.border = {
      ...next.border,
      width: clampNum(next.border.width, ...BORDER_WIDTH_RANGE),
    };
  }
  if (next.shadow) {
    next.shadow = {
      ...next.shadow,
      x: clampNum(next.shadow.x, ...VENUE_BLOCK_BOUNDS.shadowOffset),
      y: clampNum(next.shadow.y, ...VENUE_BLOCK_BOUNDS.shadowOffset),
      blur: clampNum(next.shadow.blur, ...VENUE_BLOCK_BOUNDS.shadowBlur),
      opacity: clampNum(next.shadow.opacity, ...VENUE_BLOCK_BOUNDS.shadowOpacity),
    };
  }
  return next;
}

// Total price-list items across sections capped at PRICE_LIST_MAX_ITEMS,
// filling sections in order. Idempotent — a second pass finds the total
// already within budget.
function clampPriceListSections(
  sections: PriceListProps["sections"],
): PriceListProps["sections"] {
  let remaining = PRICE_LIST_MAX_ITEMS;
  return sections.map((section) => {
    const items = section.items.slice(0, Math.max(0, remaining));
    remaining -= items.length;
    return { ...section, items };
  });
}

export function clamp(block: VenueBlock): VenueBlock {
  const base = clampBase(block.base);
  switch (block.type) {
    case "gallery":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          columns: clampNum(block.props.columns, ...GALLERY_COLUMNS_RANGE),
          gap: clampNum(block.props.gap, ...GALLERY_GAP_RANGE),
          items: block.props.items.slice(0, GALLERY_MAX_ITEMS),
        },
      };
    case "programTimeline":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          items: block.props.items.slice(0, PROGRAM_MAX_ITEMS),
        },
      };
    case "priceList":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          sections: clampPriceListSections(block.props.sections),
        },
      };
    case "map":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          zoom: clampNum(block.props.zoom, ...MAP_ZOOM_RANGE),
        },
      };
    case "profileCards":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          columns: clampNum(block.props.columns, ...PROFILE_COLUMNS_RANGE),
        },
      };
    case "pastEvents":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          limit: clampNum(block.props.limit, ...PAST_EVENTS_LIMIT_RANGE),
        },
      };
    case "spacer":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          height: clampNum(block.props.height, ...SPACER_HEIGHT_RANGE),
        },
      };
    case "reservation":
      return {
        ...block,
        base,
        props: {
          ...block.props,
          capacity:
            block.props.capacity === undefined
              ? undefined
              : clampNum(block.props.capacity, ...CAPACITY_RANGE),
        },
      };
    default:
      return { ...block, base };
  }
}

// Enforce the 30-block config cap and clamp every block. Idempotent.
export function clampBlockList(blocks: VenueBlock[]): VenueBlock[] {
  return blocks.slice(0, MAX_BLOCKS).map(clamp);
}
