// gallery — server wrapper: resolves storage ids to file URLs, computes
// next/image `sizes` from the real column count, and derives each item's
// aspect ratio. The block model stores no intrinsic dimensions, so "original"
// is rendered as a deterministic ratio rhythm (1/1 · 4/5 · 3/2 cycling) —
// masonry texture without layout shift. The interactive grid + lightbox is the
// client leaf.

import { fmt } from "@/lib/i18n";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import type { GalleryProps } from "@/lib/venue-blocks";
import { venueStorageUrl } from "../venue-view";
import { GalleryClient, type GalleryItem } from "./gallery-client";

const PAGE_MAX_PX = 736; // .frame max-width (46rem)
const ORIGINAL_RHYTHM = ["1 / 1", "4 / 5", "3 / 2"] as const;

function itemAspect(aspect: GalleryProps["aspect"], index: number): string {
  if (aspect === "square") return "1 / 1";
  if (aspect === "landscape") return "3 / 2";
  return ORIGINAL_RHYTHM[index % ORIGINAL_RHYTHM.length];
}

export function GalleryBlock({ props }: { props: GalleryProps }) {
  const items: GalleryItem[] = props.items.flatMap((item, index) => {
    const url = venueStorageUrl(item.storageId);
    if (!url) return [];
    return [
      {
        id: item.id,
        url,
        alt: item.alt || fmt(dict.galleryImageAlt, { index: index + 1 }),
        caption: item.caption,
        aspect:
          props.layout === "masonry"
            ? itemAspect(props.aspect, index)
            : props.aspect === "landscape"
              ? "3 / 2"
              : props.aspect === "square"
                ? "1 / 1"
                : itemAspect(props.aspect, index),
      },
    ];
  });
  if (items.length === 0) return null;

  const columns = props.layout === "carousel" ? 1 : props.columns;
  const sizes =
    props.layout === "carousel"
      ? `(max-width: ${PAGE_MAX_PX}px) 78vw, ${Math.round(PAGE_MAX_PX * 0.78)}px`
      : `(max-width: ${PAGE_MAX_PX}px) ${Math.round(100 / columns)}vw, ${Math.round(PAGE_MAX_PX / columns)}px`;

  return (
    <GalleryClient
      layout={props.layout}
      columns={props.columns}
      gap={props.gap}
      lightbox={props.lightbox}
      items={items}
      sizes={sizes}
      labels={{
        openAria: dict.lightboxOpenAria,
        countLabel: dict.lightboxLabel,
        close: dict.lightboxClose,
        prev: dict.lightboxPrev,
        next: dict.lightboxNext,
      }}
    />
  );
}
