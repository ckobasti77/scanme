import { v } from "convex/values";
import {
  designAlignmentValidator,
  designFontKeyValidator,
  designScaleValidator,
  designShadowValidator,
  designTypographyValidator,
  designWeightValidator,
  scanMeDesignV2BackgroundValidator,
} from "./designEngineValidators";

// The Venue block model (RFC-001 §2.4 C.2, §2.5): the page-level design token
// validator and the discriminated block union stored on `venueEventConfigs`.
//
// Deliberate composition rule (§2.5): `venueDesignValidator` does NOT compose
// `scanMeDesignValidator` — that union's `presetKey`/`iconStyle` are
// Links-hardcoded 15-member sets. Venue re-uses only the product-agnostic V2
// background union (via designEngineValidators, one source of truth) and the
// independently-defined shadow/typography validators of identical shape. The
// pure defaults/clamps that normalize documents written against these live in
// `lib/venue-blocks.ts` (importable from `convex/`, no Convex imports there),
// exactly the way `convex/scanMeLinks.ts` imports `lib/scanme-links-design.ts`.

// ---------------------------------------------------------------------------
// Page-level design (`--venue-*` tokens are compiled from this — §2.5, TASK-07)
// ---------------------------------------------------------------------------

// The Venue colour role set: the Links 11 roles minus the three button-specific
// ones (`button`/`buttonHover`/`buttonText`) — Venue has no page-global button
// style; blocks own their own surfaces. `lib/design-engine/palette.ts` derives
// exactly these roles from a 5-colour palette.
export const venueColorsValidator = v.object({
  page: v.string(),
  surface: v.string(),
  title: v.string(),
  body: v.string(),
  accent: v.string(),
  border: v.string(),
  focus: v.string(),
  icon: v.string(),
});

// Page-level effects: the two shadows Links actually persists (text + logo).
// Per-block shadows live on `blockBaseValidator.shadow`.
export const venueEffectsValidator = v.object({
  textShadow: designShadowValidator,
  logoShadow: designShadowValidator,
});

export const venueDesignValidator = v.object({
  version: v.literal(1),
  colors: venueColorsValidator,
  typography: designTypographyValidator,
  background: scanMeDesignV2BackgroundValidator,
  effects: v.optional(venueEffectsValidator),
});

// ---------------------------------------------------------------------------
// Per-block base — RFC §2.5, verbatim
// ---------------------------------------------------------------------------

export const blockBaseValidator = v.object({
  id: v.string(), // stable uuid — selection, history grouping, React keys
  visible: v.boolean(), // soft-hide without delete
  responsive: v.optional(
    v.object({ desktop: v.boolean(), mobile: v.boolean() }),
  ),
  size: v.optional(
    v.union(v.literal("full"), v.literal("wide"), v.literal("narrow")),
  ),
  alignment: v.optional(designAlignmentValidator),
  spacing: v.optional(v.object({ top: v.number(), bottom: v.number() })), // px, clamped
  radius: v.optional(v.number()),
  border: v.optional(v.object({ width: v.number(), color: v.string() })),
  shadow: v.optional(designShadowValidator),
  surface: v.optional(
    v.union(
      v.literal("none"),
      v.literal("card"),
      v.object({ kind: v.literal("custom"), color: v.string() }),
    ),
  ),
  colorOverride: v.optional(
    v.object({
      title: v.optional(v.string()),
      body: v.optional(v.string()),
      accent: v.optional(v.string()),
    }),
  ),
  typographyOverride: v.optional(
    v.object({
      fontKey: v.optional(designFontKeyValidator),
      headingWeight: v.optional(designWeightValidator),
      bodyWeight: v.optional(designWeightValidator),
      scale: v.optional(designScaleValidator),
    }),
  ),
  animation: v.optional(
    v.union(v.literal("none"), v.literal("fade-up"), v.literal("reveal")),
  ),
});

// ---------------------------------------------------------------------------
// Block props — one per type. `countdown`, `programTimeline`, `gallery` are the
// RFC's verbatim payloads; the rest follow the same style (§2.5).
// ---------------------------------------------------------------------------

const countdownProps = v.object({
  target: v.union(
    v.literal("eventStart"),
    v.object({ kind: v.literal("custom"), timestamp: v.number() }),
  ),
  units: v.object({
    days: v.boolean(),
    hours: v.boolean(),
    minutes: v.boolean(),
    seconds: v.boolean(),
  }),
  style: v.union(
    v.literal("digits"),
    v.literal("cards"),
    v.literal("minimal"),
  ),
  completedBehavior: v.union(v.literal("hide"), v.literal("message")),
  completedMessage: v.optional(v.string()),
});

// start/end, venue name/address, Google-Calendar + generated .ics toggles
// (the add-to-calendar constraint). Absent times inherit the event's own.
const eventDateTimeProps = v.object({
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
  venueName: v.optional(v.string()),
  address: v.optional(v.string()),
  showAddToCalendar: v.boolean(),
  googleCalendarLink: v.boolean(),
  icsDownload: v.boolean(),
});

const programTimelineProps = v.object({
  heading: v.optional(v.string()),
  layout: v.union(
    v.literal("timeline"),
    v.literal("list"),
    v.literal("grid"),
  ),
  showTimes: v.boolean(),
  items: v.array(
    v.object({
      id: v.string(),
      startsAt: v.optional(v.number()),
      title: v.string(),
      subtitle: v.optional(v.string()),
      imageStorageId: v.optional(v.id("_storage")),
    }),
  ), // ≤ 40, clamp-enforced
});

// address or lat/lng, zoom, pin label, static vs embed
const mapProps = v.object({
  location: v.union(
    v.object({ kind: v.literal("address"), address: v.string() }),
    v.object({ kind: v.literal("coords"), lat: v.number(), lng: v.number() }),
  ),
  zoom: v.number(),
  pinLabel: v.optional(v.string()),
  display: v.union(v.literal("static"), v.literal("embed")),
});

const galleryProps = v.object({
  layout: v.union(
    v.literal("grid"),
    v.literal("masonry"),
    v.literal("carousel"),
  ),
  columns: v.number(), // clamped 1–4
  gap: v.number(),
  aspect: v.union(
    v.literal("original"),
    v.literal("square"),
    v.literal("landscape"),
  ),
  lightbox: v.boolean(),
  items: v.array(
    v.object({
      id: v.string(),
      storageId: v.id("_storage"),
      alt: v.optional(v.string()),
      caption: v.optional(v.string()),
    }),
  ), // ≤ 24
});

// name, role, image, link per performer
const performerCardsProps = v.object({
  heading: v.optional(v.string()),
  layout: v.union(v.literal("grid"), v.literal("list")),
  columns: v.number(), // clamped 1–4
  items: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      role: v.optional(v.string()),
      imageStorageId: v.optional(v.id("_storage")),
      link: v.optional(v.string()),
    }),
  ),
});

// sections → items, currency
const menuProps = v.object({
  heading: v.optional(v.string()),
  currency: v.string(),
  sections: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      items: v.array(
        v.object({
          id: v.string(),
          name: v.string(),
          description: v.optional(v.string()),
          price: v.optional(v.number()),
        }),
      ),
    }),
  ), // ≤ 60 items total across sections
});

// field config, capacity, deadline (submissions land in a future table)
const reservationProps = v.object({
  heading: v.optional(v.string()),
  fields: v.object({
    name: v.boolean(),
    phone: v.boolean(),
    email: v.boolean(),
    partySize: v.boolean(),
    note: v.boolean(),
  }),
  capacity: v.optional(v.number()),
  deadline: v.optional(v.number()),
  confirmationMessage: v.optional(v.string()),
});

// channels, prefilled message
const shareProps = v.object({
  heading: v.optional(v.string()),
  channels: v.array(
    v.union(
      v.literal("whatsapp"),
      v.literal("viber"),
      v.literal("facebook"),
      v.literal("x"),
      v.literal("copy"),
    ),
  ),
  message: v.optional(v.string()),
});

// auto-sourced from the business's archived events at render time
const pastEventsProps = v.object({
  heading: v.optional(v.string()),
  layout: v.union(v.literal("grid"), v.literal("list")),
  limit: v.number(), // how many archived events to show; clamped 1–24
});

const richTextProps = v.object({
  content: v.string(),
});

const spacerProps = v.object({
  height: v.number(), // px, clamped
  divider: v.boolean(),
});

// ---------------------------------------------------------------------------
// The discriminated block union — exactly the twelve §2.5 types
// ---------------------------------------------------------------------------

export const venueBlockValidator = v.union(
  v.object({ type: v.literal("countdown"), base: blockBaseValidator, props: countdownProps }),
  v.object({ type: v.literal("eventDateTime"), base: blockBaseValidator, props: eventDateTimeProps }),
  v.object({ type: v.literal("programTimeline"), base: blockBaseValidator, props: programTimelineProps }),
  v.object({ type: v.literal("map"), base: blockBaseValidator, props: mapProps }),
  v.object({ type: v.literal("gallery"), base: blockBaseValidator, props: galleryProps }),
  v.object({ type: v.literal("performerCards"), base: blockBaseValidator, props: performerCardsProps }),
  v.object({ type: v.literal("menu"), base: blockBaseValidator, props: menuProps }),
  v.object({ type: v.literal("reservation"), base: blockBaseValidator, props: reservationProps }),
  v.object({ type: v.literal("share"), base: blockBaseValidator, props: shareProps }),
  v.object({ type: v.literal("pastEvents"), base: blockBaseValidator, props: pastEventsProps }),
  v.object({ type: v.literal("richText"), base: blockBaseValidator, props: richTextProps }),
  v.object({ type: v.literal("spacer"), base: blockBaseValidator, props: spacerProps }),
);
