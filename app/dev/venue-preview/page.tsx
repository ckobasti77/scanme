// Dev-only Venue preview: renders the real VenueTemplate/VenueStateScreen with
// fixture data so all three lifecycle states, the twelve blocks, and both
// design variants can be exercised in a browser without any Convex data.
// Unavailable in production, mirroring app/dev/template-gallery.
//
//   /dev/venue-preview            → live state (default design)
//   ?state=before|live|after|empty|inactive
//   ?design=dark                  → dark token variant

import { notFound } from "next/navigation";
import {
  VenueStateScreen,
  VenueTemplate,
} from "@/components/venue/venue-template";
import {
  DARK_VENUE_DESIGN,
  FIXTURE_ARCHIVE,
  fixtureView,
} from "@/components/venue/venue-fixtures";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import { serverNow } from "@/lib/venue-calendar";

export const dynamic = "force-dynamic";

export default async function VenuePreviewPage({
  searchParams,
}: PageProps<"/dev/venue-preview">) {
  if (process.env.NODE_ENV === "production") notFound();

  const resolved = await searchParams;
  const state =
    typeof resolved.state === "string" ? resolved.state : "live";
  const design = resolved.design === "dark" ? DARK_VENUE_DESIGN : undefined;

  if (state === "empty") {
    return (
      <VenueStateScreen
        badge="before"
        title={dict.beforeEmptyTitle}
        eyebrow="Klub Mimeza"
        logoUrl={null}
        body={dict.beforeEmptyBody}
      />
    );
  }

  if (state === "inactive") {
    return (
      <VenueStateScreen
        badge={null}
        title={dict.inactiveTitle}
        eyebrow="Klub Mimeza"
        logoUrl={null}
        body={dict.inactiveBody}
      />
    );
  }

  if (state === "after") {
    const view = fixtureView({
      status: "ended",
      startsAt: serverNow() - 2 * 86_400_000,
      design,
    });
    return (
      <VenueTemplate
        view={view}
        lifecycle="after"
        businessSlug="klub-mimeza"
        pastEvents={FIXTURE_ARCHIVE}
        footerLink={{ href: "#", label: dict.archiveLink }}
      />
    );
  }

  const before = state === "before";
  const now = serverNow();
  const view = fixtureView({
    status: before ? "scheduled" : "live",
    startsAt: before ? now + 3 * 86_400_000 + 5 * 3600_000 : now - 3600_000,
    design,
  });

  return (
    <VenueTemplate
      view={view}
      lifecycle={before ? "before" : "live"}
      businessSlug="klub-mimeza"
      pastEvents={FIXTURE_ARCHIVE}
      footerLink={{ href: "#", label: dict.archiveLink }}
    />
  );
}
