// /[slug]/venue/arhiva — the archived-events list. Gated on venue ownership
// (a business without a Venue profile 404s); an owned-but-empty archive
// renders the quiet empty state, never a broken shell.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { GalleryClient } from "@/components/venue/blocks/gallery-client";
import { VenueStateScreen } from "@/components/venue/venue-template";
import styles from "@/components/venue/venue-template.module.css";
import { fmt } from "@/lib/i18n";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import { formatBelgradeDateShort } from "@/lib/venue-calendar";

export const dynamic = "force-dynamic";

const getPageState = cache(async (slug: string) =>
  fetchQuery(api.venue.publicVenuePageState, { businessSlug: slug }),
);
const getArchive = cache(async (slug: string) =>
  fetchQuery(api.venue.archivedEvents, { businessSlug: slug }),
);

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/venue/arhiva">): Promise<Metadata> {
  const { slug } = await params;
  const state = await getPageState(slug);
  if (!state) return { robots: { index: false, follow: false } };
  return {
    title: fmt(dict.metaArchiveTitle, { name: state.businessName }),
    description: dict.metaArchiveDescription,
  };
}

export default async function VenueArchivePage({
  params,
}: PageProps<"/[slug]/venue/arhiva">) {
  const { slug } = await params;
  const state = await getPageState(slug);
  if (!state) notFound();

  const archive = state.hasArchive ? await getArchive(slug) : [];

  return (
    <VenueStateScreen
      badge={null}
      title={dict.archiveTitle}
      eyebrow={state.businessName}
      logoUrl={state.logoUrl}
      body={archive.length === 0 ? dict.archiveEmpty : null}
      footerLink={{ href: `/${slug}/venue`, label: dict.currentEventLink }}
    >
      {archive.map((event) => {
        const when = event.startsAt ?? event.endsAt ?? event.archivedAt;
        return (
          <section key={event.slug} className={styles.archiveEvent}>
            <h2 className={styles.archiveEventTitle}>{event.title}</h2>
            <p className={styles.archiveEventMeta}>
              {when !== null ? `${formatBelgradeDateShort(when)} · ` : ""}
              {fmt(dict.archivePhotoCount, { count: event.items.length })}
            </p>
            {event.items.length > 0 ? (
              <GalleryClient
                layout="grid"
                columns={3}
                gap={8}
                lightbox
                sizes="(max-width: 736px) 33vw, 245px"
                items={event.items.flatMap((item, index) =>
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
            ) : null}
          </section>
        );
      })}
    </VenueStateScreen>
  );
}
