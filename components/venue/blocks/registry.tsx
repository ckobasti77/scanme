// The Venue block registry (RFC-001 §2.5): { type, Render, label, icon } per
// block type. The RFC's `EditorPanel` entry is deliberately NOT built here —
// that is TASK-10; the registry's shape leaves the slot ready (an editor mode
// extends these entries with its panel component without touching the render
// path). Labels come from the venue-editor dictionary because the palette is
// an editor surface.

import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  Timer,
  ListOrdered,
  MapPin,
  Images,
  Users,
  ReceiptText,
  ClipboardPen,
  Share2,
  History,
  Text,
  SeparatorHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { venueEditorSr } from "@/lib/i18n/sr/venue-editor";
import type { VenueBlock, VenueBlockType } from "@/lib/venue-blocks";
import type { VenueRenderContext } from "../venue-view";
import { BlockShell } from "./block-shell";
import { CountdownBlock } from "./countdown-block";
import { EventDateTimeBlock } from "./event-datetime-block";
import { ProgramTimelineBlock } from "./program-timeline-block";
import { MapBlock } from "./map-block";
import { GalleryBlock } from "./gallery-block";
import { ProfileCardsBlock } from "./profile-cards-block";
import { PriceListBlock } from "./price-list-block";
import { ReservationBlock } from "./reservation-block";
import { ShareBlock } from "./share-block";
import { PastEventsBlock } from "./past-events-block";
import { RichTextBlock } from "./rich-text-block";
import { SpacerBlock } from "./spacer-block";

// The editor's per-block property panel contract (RFC §2.5 `EditorPanel`).
// TASK-10 wires the seam without filling it: no entry sets a panel yet, so the
// editor falls back to a placeholder that names the block; TASK-11 supplies
// the twelve panels through this slot without touching the render path.
export type VenueBlockEditorPanelProps = {
  block: VenueBlock;
  onChange: (next: VenueBlock, group?: string) => void;
};

export type VenueBlockRegistryEntry = {
  type: VenueBlockType;
  label: string;
  icon: LucideIcon;
  Render: (props: { block: VenueBlock; ctx: VenueRenderContext }) => ReactNode;
  EditorPanel?: (props: VenueBlockEditorPanelProps) => ReactNode;
};

// One switch renders the discriminated union with full narrowing; registry
// entries reuse it so both lookup styles stay in sync.
export function renderVenueBlockContent(
  block: VenueBlock,
  ctx: VenueRenderContext,
): ReactNode {
  switch (block.type) {
    case "countdown":
      return <CountdownBlock props={block.props} ctx={ctx} />;
    case "eventDateTime":
      return <EventDateTimeBlock props={block.props} ctx={ctx} />;
    case "programTimeline":
      return <ProgramTimelineBlock props={block.props} />;
    case "map":
      return <MapBlock props={block.props} />;
    case "gallery":
      return <GalleryBlock props={block.props} />;
    case "profileCards":
      return <ProfileCardsBlock props={block.props} />;
    case "priceList":
      return <PriceListBlock props={block.props} />;
    case "reservation":
      return <ReservationBlock props={block.props} ctx={ctx} />;
    case "share":
      return <ShareBlock props={block.props} ctx={ctx} />;
    case "pastEvents":
      return <PastEventsBlock props={block.props} ctx={ctx} />;
    case "richText":
      return <RichTextBlock props={block.props} />;
    case "spacer":
      return <SpacerBlock props={block.props} />;
  }
}

// The full block: base-property shell around the type's content.
export function VenueBlockRender({
  block,
  ctx,
}: {
  block: VenueBlock;
  ctx: VenueRenderContext;
}) {
  const content = renderVenueBlockContent(block, ctx);
  if (content === null) return null;
  return <BlockShell block={block}>{content}</BlockShell>;
}

function entry(
  type: VenueBlockType,
  label: string,
  icon: LucideIcon,
): VenueBlockRegistryEntry {
  return { type, label, icon, Render: VenueBlockRender };
}

export const VENUE_BLOCK_REGISTRY: Record<
  VenueBlockType,
  VenueBlockRegistryEntry
> = {
  countdown: entry("countdown", venueEditorSr.blockLabelCountdown, Timer),
  eventDateTime: entry(
    "eventDateTime",
    venueEditorSr.blockLabelEventDateTime,
    CalendarClock,
  ),
  programTimeline: entry(
    "programTimeline",
    venueEditorSr.blockLabelProgramTimeline,
    ListOrdered,
  ),
  map: entry("map", venueEditorSr.blockLabelMap, MapPin),
  gallery: entry("gallery", venueEditorSr.blockLabelGallery, Images),
  profileCards: entry(
    "profileCards",
    venueEditorSr.blockLabelProfileCards,
    Users,
  ),
  priceList: entry("priceList", venueEditorSr.blockLabelPriceList, ReceiptText),
  reservation: entry(
    "reservation",
    venueEditorSr.blockLabelReservation,
    ClipboardPen,
  ),
  share: entry("share", venueEditorSr.blockLabelShare, Share2),
  pastEvents: entry("pastEvents", venueEditorSr.blockLabelPastEvents, History),
  richText: entry("richText", venueEditorSr.blockLabelRichText, Text),
  spacer: entry("spacer", venueEditorSr.blockLabelSpacer, SeparatorHorizontal),
};
