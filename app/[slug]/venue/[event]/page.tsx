// /[slug]/venue/[event] — a specific event's published page (sharing and the
// archive). The event's own materialized status picks the lifecycle design:
// draft/scheduled render "before", live renders "live", ended/archived render
// the recap. Unknown event or never-published config ⇒ segment 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { GalleryClient } from "@/components/venue/blocks/gallery-client";
import { VenueTemplate } from "@/components/venue/venue-template";
import type { VenueLifecycle } from "@/components/venue/venue-view";
import styles from "@/components/venue/venue-template.module.css";
import { fmt } from "@/lib/i18n";
import { venueSr as dict } from "@/lib/i18n/sr/venue";

export const dynamic = "force-dynamic";

const getEventView = cache(async (slug: string, eventSlug: string) =>
  fetchQuery(api.venue.publicEventView, {
    businessSlug: slug,
    eventSlug,
  }),
);
const getArchive = cache(async (slug: string) =>
  fetchQuery(api.venue.archivedEvents, { businessSlug: slug }),
);

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/venue/[event]">): Promise<Metadata> {
  const { slug, event } = await params;
  const view = await getEventView(slug, event);
  if (!view) return { robots: { index: false, follow: false } };

  const title = fmt(dict.metaEventTitle, {
    title: view.event.title,
    name: view.displayName,
  });
  const image = view.backgroundImageUrl ?? view.logoUrl;
  return {
    title,
    description: dict.metaDescription,
    openGraph: {
      title,
      description: dict.metaDescription,
      type: "website",
      locale: "sr_RS",
      siteName: view.displayName,
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: view.backgroundImageUrl ? "summary_large_image" : "summary",
      title,
      description: dict.metaDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}

const LIFECYCLE_BY_STATUS: Record<string, VenueLifecycle> = {
  draft: "before",
  scheduled: "before",
  live: "live",
  ended: "after",
  archived: "after",
};

export default async function VenueEventPage({
  params,
}: PageProps<"/[slug]/venue/[event]">) {
  const { slug, event } = await params;
  const view = await getEventView(slug, event);
  if (!view) notFound();

  const lifecycle = LIFECYCLE_BY_STATUS[view.event.status] ?? "before";
  const needsArchive =
    view.event.status === "archived" ||
    view.blocks.some((block) => block.type === "pastEvents");
  const archive = needsArchive ? await getArchive(slug) : null;

  // An archived event shows its own selected photos as a recap gallery.
  const ownArchive =
    view.event.status === "archived"
      ? (archive ?? []).find((entry) => entry.slug === view.event.slug) ?? null
      : null;

  return (
    <VenueTemplate
      view={view}
      lifecycle={lifecycle}
      businessSlug={slug}
      pastEvents={archive}
      footerLink={{ href: `/${slug}/venue`, label: dict.currentEventLink }}
    >
      {ownArchive && ownArchive.items.length > 0 ? (
        <div>
          <h2 className={styles.blockHeading}>{dict.archiveTitle}</h2>
          <GalleryClient
            layout="grid"
            columns={3}
            gap={8}
            lightbox
            sizes="(max-width: 736px) 33vw, 245px"
            items={ownArchive.items.flatMap((item, index) =>
              item.fullUrl
                ? [
                    {
                      id: String(item.id),
                      url: item.fullUrl,
                      alt: fmt(dict.galleryImageAlt, { index: index + 1 }),
                      aspect: "1 / 1",
                    },
                  ]
                : [],
            )}
            labels={{
              openAria: dict.lightboxOpenAria,
              carouselAria: dict.galleryCarouselAria,
              countLabel: dict.lightboxLabel,
              close: dict.lightboxClose,
              prev: dict.lightboxPrev,
              next: dict.lightboxNext,
            }}
          />
        </div>
      ) : null}
    </VenueTemplate>
  );
}
