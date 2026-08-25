// Dev/test fixtures for the Venue render layer: one fully-populated event
// (all twelve block types with believable Serbian content, exercising the base
// properties — surfaces, overrides, sizes, animations) plus a dark design
// variant and archive entries. Consumed by app/dev/venue-preview (browser QA)
// and the render smoke test. Never imported by a public route.

import type { VenueDesign } from "@/lib/design-engine/venue-tokens";
import { DEFAULT_VENUE_DESIGN } from "@/lib/design-engine/venue-tokens";
import type { VenueBlock } from "@/lib/venue-blocks";
import type { ArchivedEventView, VenuePageView } from "./venue-view";

export const DARK_VENUE_DESIGN: VenueDesign = {
  version: 1,
  colors: {
    page: "#14161A",
    surface: "#1E2126",
    title: "#F2EFE9",
    body: "#C9C4BA",
    accent: "#D9A662",
    border: "#2E323A",
    focus: "#D9A662",
    icon: "#D9A662",
  },
  typography: {
    fontKey: "playfair-display",
    headingWeight: 600,
    bodyWeight: 400,
    alignment: "center",
    scale: "medium",
    lineHeight: 1.55,
    verticalSpacing: 18,
  },
  background: { category: "flat", color: "#14161A" },
};

function at(hour: number, minute: number, dayOffset: number, base: number) {
  const d = new Date(base + dayOffset * 86_400_000);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export function fixtureBlocks(startsAt: number): VenueBlock[] {
  return [
    {
      type: "countdown",
      base: { id: "b-countdown", visible: true, animation: "fade-up" },
      props: {
        target: "eventStart",
        units: { days: true, hours: true, minutes: true, seconds: true },
        style: "cards",
        completedBehavior: "message",
        completedMessage: "Vrata su otvorena — vidimo se unutra!",
      },
    },
    {
      type: "eventDateTime",
      base: { id: "b-datetime", visible: true, surface: "card" },
      props: {
        venueName: "Klub Mimeza",
        address: "Karađorđeva 2, Beograd",
        showAddToCalendar: true,
        googleCalendarLink: true,
        icsDownload: true,
      },
    },
    {
      type: "richText",
      base: { id: "b-intro", visible: true },
      props: {
        content:
          "Otvaramo letnju sezonu na krovu. Tri benda, koktel karta i pogled na Savu.\n\nUlaz je slobodan uz rezervaciju stola.",
      },
    },
    {
      type: "programTimeline",
      base: { id: "b-program", visible: true, animation: "reveal" },
      props: {
        heading: "Program večeri",
        layout: "timeline",
        showTimes: true,
        items: [
          { id: "p1", startsAt: at(20, 0, 0, startsAt), title: "Otvaranje i welcome koktel", subtitle: "DJ Lenka na gramofonima" },
          { id: "p2", startsAt: at(21, 30, 0, startsAt), title: "Divlje jagode — akustični set" },
          { id: "p3", startsAt: at(23, 0, 0, startsAt), title: "Mimeza houseband", subtitle: "uz specijalne goste" },
          { id: "p4", startsAt: at(1, 0, 1, startsAt), title: "Afterparty na krovu" },
        ],
      },
    },
    {
      type: "profileCards",
      base: { id: "b-performers", visible: true },
      props: {
        heading: "Nastupaju",
        layout: "grid",
        columns: 3,
        items: [
          { id: "a1", name: "DJ Lenka", role: "warm-up", imageStorageId: "/dev-venue/4.jpg" },
          { id: "a2", name: "Divlje jagode", role: "akustični set", imageStorageId: "/dev-venue/5.jpg" },
          { id: "a3", name: "Mimeza houseband", role: "glavni program", imageStorageId: "/dev-venue/6.jpg" },
        ],
      },
    },
    {
      type: "gallery",
      base: { id: "b-gallery", visible: true, animation: "reveal" },
      props: {
        layout: "grid",
        columns: 3,
        gap: 8,
        aspect: "square",
        lightbox: true,
        items: [
          { id: "g1", storageId: "/dev-venue/1.jpg", caption: "Krovna terasa" },
          { id: "g2", storageId: "/dev-venue/2.jpg" },
          { id: "g3", storageId: "/dev-venue/3.jpg", caption: "Prošlogodišnje otvaranje" },
          { id: "g4", storageId: "/dev-venue/4.jpg" },
          { id: "g5", storageId: "/dev-venue/5.jpg" },
          { id: "g6", storageId: "/dev-venue/6.jpg" },
        ],
      },
    },
    {
      type: "priceList",
      base: { id: "b-menu", visible: true, surface: "card" },
      props: {
        heading: "Koktel karta",
        currency: "RSD",
        sections: [
          {
            id: "m1",
            title: "Kokteli",
            items: [
              { id: "m1a", name: "Mimeza spritz", description: "bazga, prosecco, grejp", price: 890 },
              { id: "m1b", name: "Sava sour", description: "šljivovica, limun, belance", price: 950 },
              { id: "m1c", name: "Kalemegdan mule", price: 870 },
            ],
          },
          {
            id: "m2",
            title: "Bez alkohola",
            items: [
              { id: "m2a", name: "Domaća limunada sa lavandom", price: 450 },
              { id: "m2b", name: "Hladni espresso tonik", price: 520 },
            ],
          },
        ],
      },
    },
    {
      type: "map",
      base: { id: "b-map", visible: true },
      props: {
        location: { kind: "address", address: "Karađorđeva 2, Beograd" },
        zoom: 16,
        pinLabel: "Klub Mimeza — ulaz iz Male Vasine",
        display: "embed",
      },
    },
    {
      type: "reservation",
      base: { id: "b-reservation", visible: true, surface: "card" },
      props: {
        heading: "Rezerviši sto",
        fields: { name: true, phone: true, email: false, partySize: true, note: true },
        capacity: 120,
        confirmationMessage: "Sto je rezervisan — potvrda stiže porukom.",
      },
    },
    {
      type: "share",
      base: { id: "b-share", visible: true },
      props: {
        channels: ["whatsapp", "viber", "copy"],
        message: "Vidimo se na otvaranju sezone kod Mimeze!",
      },
    },
    {
      type: "spacer",
      base: { id: "b-spacer", visible: true },
      props: { height: 24, divider: true },
    },
    {
      type: "pastEvents",
      base: { id: "b-past", visible: true },
      props: { heading: "Kako je bilo ranije", layout: "grid", limit: 4 },
    },
  ];
}

export const FIXTURE_ARCHIVE: ArchivedEventView[] = [
  {
    slug: "docek-2026",
    title: "Doček 2026.",
    startsAt: Date.UTC(2025, 11, 31, 21, 0),
    endsAt: Date.UTC(2026, 0, 1, 3, 0),
    archivedAt: Date.UTC(2026, 0, 3, 12, 0),
    items: [1, 2, 3].map((n) => ({
      id: `arch-${n}` as ArchivedEventView["items"][number]["id"],
      order: n,
      fullUrl: `/dev-venue/${n}.jpg`,
      thumbUrl: `/dev-venue/${n}.jpg`,
      width: 1200,
      height: 900,
    })),
  },
  {
    slug: "jesenji-dzez",
    title: "Jesenji džez vikend",
    startsAt: Date.UTC(2025, 9, 17, 19, 0),
    endsAt: Date.UTC(2025, 9, 17, 23, 30),
    archivedAt: Date.UTC(2025, 9, 20, 9, 0),
    items: [4, 5].map((n) => ({
      id: `arch-${n}` as ArchivedEventView["items"][number]["id"],
      order: n,
      fullUrl: `/dev-venue/${n}.jpg`,
      thumbUrl: `/dev-venue/${n}.jpg`,
      width: 1200,
      height: 900,
    })),
  },
];

export function fixtureView(options: {
  status: VenuePageView["event"]["status"];
  startsAt: number;
  design?: VenueDesign | null;
  backgroundImageUrl?: string | null;
}): VenuePageView {
  return {
    event: {
      slug: "letnja-sezona",
      title: "Otvaranje letnje sezone",
      status: options.status,
      startsAt: options.startsAt,
      endsAt: options.startsAt + 6 * 3600_000,
    },
    displayName: "Klub Mimeza",
    design: (options.design === undefined
      ? DEFAULT_VENUE_DESIGN
      : options.design) as VenuePageView["design"],
    blocks: fixtureBlocks(options.startsAt) as unknown as VenuePageView["blocks"],
    logoUrl: null,
    backgroundImageUrl: options.backgroundImageUrl ?? null,
    backgroundVideoUrl: null,
  };
}
