// /[slug]/venue — the printed card's forever target (RFC-001 §2.7). Never 404s
// for a business that owns Venue: the page-state query resolves one of the
// three lives (before / live / after) plus the inactive and empty edges, and
// only a missing business/profile falls through to notFound().

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { GalleryClient } from "@/components/venue/blocks/gallery-client";
import {
  VenueStateScreen,
  VenueTemplate,
} from "@/components/venue/venue-template";
import type { ArchivedEventView } from "@/components/venue/venue-view";
import styles from "@/components/venue/venue-template.module.css";
import { fmt } from "@/lib/i18n";
import { venueSr as dict } from "@/lib/i18n/sr/venue";

export const dynamic = "force-dynamic";

// cache() dedupes the query between generateMetadata and the page render.
const getPageState = cache(async (slug: string) =>
  fetchQuery(api.venue.publicVenuePageState, { businessSlug: slug }),
);
const getArchive = cache(async (slug: string) =>
  fetchQuery(api.venue.archivedEvents, { businessSlug: slug }),
);

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/venue">): Promise<Metadata> {
  const { slug } = await params;
  const state = await getPageState(slug);
  if (!state) return { robots: { index: false, follow: false } };

  const view =
    state.state.kind === "live" || state.state.kind === "before"
      ? state.state.view
      : null;
  const title = view
    ? fmt(dict.metaEventTitle, {
        title: view.event.title,
        name: view.displayName,
      })
    : fmt(dict.metaVenueTitle, { name: state.businessName });
  const image = view?.backgroundImageUrl ?? view?.logoUrl ?? state.logoUrl;

  return {
    title,
    description: dict.metaDescription,
    openGraph: {
      title,
      description: dict.metaDescription,
      type: "website",
      locale: "sr_RS",
      siteName: view?.displayName ?? state.businessName,
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: view?.backgroundImageUrl ? "summary_large_image" : "summary",
      title,
      description: dict.metaDescription,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// The "after" recap: thanks, the latest archive as a lightbox gallery, and the
// bridge into the archive listing. (The Memories seam lives here later.)
function AfterRecap({
  archive,
  businessSlug,
}: {
  archive: ArchivedEventView[];
  businessSlug: string;
}) {
  const latest = archive.find((event) => event.items.length > 0) ?? null;
  if (!latest) return null;
  return (
    <div>
      <h2 className={styles.blockHeading}>{latest.title}</h2>
      <GalleryClient
        layout="grid"
        columns={3}
        gap={8}
        lightbox
        sizes="(max-width: 736px) 33vw, 245px"
        items={latest.items.flatMap((item, index) =>
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
      <div className={styles.stateActions}>
        <Link
          className={styles.action}
          href={`/${businessSlug}/venue/${latest.slug}`}
        >
          {dict.currentEventLink}
        </Link>
      </div>
    </div>
  );
}

export default async function VenuePage({
  params,
}: PageProps<"/[slug]/venue">) {
  const { slug } = await params;
  const state = await getPageState(slug);
  if (!state) notFound();

  const archiveFooter = state.hasArchive
    ? { href: `/${slug}/venue/arhiva`, label: dict.archiveLink }
    : null;

  if (state.state.kind === "inactive") {
    return (
      <VenueStateScreen
        badge={null}
        title={dict.inactiveTitle}
        eyebrow={state.businessName}
        logoUrl={state.logoUrl}
        body={dict.inactiveBody}
      />
    );
  }

  if (state.state.kind === "after") {
    const archive = state.hasArchive ? await getArchive(slug) : [];
    return (
      <VenueStateScreen
        badge="after"
        title={dict.afterTitle}
        eyebrow={state.businessName}
        logoUrl={state.logoUrl}
        body={dict.afterBody}
        footerLink={archiveFooter}
      >
        <AfterRecap archive={archive} businessSlug={slug} />
      </VenueStateScreen>
    );
  }

  const view = state.state.kind === "live" ? state.state.view : state.state.view;
  if (!view) {
    return (
      <VenueStateScreen
        badge="before"
        title={dict.beforeEmptyTitle}
        eyebrow={state.businessName}
        logoUrl={state.logoUrl}
        body={dict.beforeEmptyBody}
        footerLink={archiveFooter}
      />
    );
  }

  const lifecycle = state.state.kind === "live" ? "live" : "before";
  const needsArchive =
    view.blocks.some((block) => block.type === "pastEvents") && state.hasArchive;
  const pastEvents = needsArchive ? await getArchive(slug) : null;

  return (
    <VenueTemplate
      view={view}
      lifecycle={lifecycle}
      businessSlug={slug}
      pastEvents={pastEvents}
      footerLink={archiveFooter}
    />
  );
}
