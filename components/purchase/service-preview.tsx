// The center panel of step 1: a READ-ONLY live preview, on a phone frame, of the
// REAL public page of the selected service (RFC-002 §2.3, TASK-34). "Čovek ne
// zna šta je Venue; ne objašnjavaj mu, pokaži mu."
//
// STRICTLY read-only. Every service renders through its EXISTING public view
// with fixture data — the same components the real routes render, the same way
// app/dev/venue-preview and app/dev/template-gallery already exercise them. No
// existing template is edited and none gains a prop for the preview; §6 of the
// RFC confirms that reading the public render (including the frozen ScanMe Links
// render path) is not a freeze touch. Menu has no product yet and Review has no
// hosted page, so those two degrade to an honest explainer card.

import { Clock, Star } from "lucide-react";
import Image from "next/image";
import { fmt } from "@/lib/i18n/format";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { ServiceId } from "@/lib/pricing/engine";
import styles from "./service-preview.module.css";

// --- Real public templates, rendered read-only with fixtures ----------------
import { ScanMeLinksTemplate } from "@/components/scanme-links/templates/registry";
import type { ScanMeLinksViewModel } from "@/components/scanme-links/templates/types";
import { DEFAULT_ACCENT_TOKENS } from "@/lib/scanme-links";
import { createDefaultScanMeLinksDesignV2 } from "@/lib/scanme-links-design";
import { VenueTemplate } from "@/components/venue/venue-template";
import { FIXTURE_ARCHIVE, fixtureView } from "@/components/venue/venue-fixtures";
import { serverNow } from "@/lib/venue-calendar";
import {
  MemoriesFooterBrand,
  MemoriesMasthead,
  MemoriesShell,
} from "@/components/memories/memories-chrome";
import { PhotoThumb } from "@/components/memories/photo-picture";
import type { PhotoImage } from "@/components/memories/memories-view";
import memoriesStyles from "@/components/memories/memories.module.css";

const dict = purchaseSr.step1;

// --- ScanMe Links fixture ---------------------------------------------------

const LINKS_VIEW: ScanMeLinksViewModel = {
  displayName: "Bloom Café",
  description: "Kafa i kolači u centru",
  logoUrl: null,
  templateKey: "option-two",
  backgroundKey: "warm-ivory",
  accent: createDefaultScanMeLinksDesignV2("bloom").colors.accent,
  accentTokens: DEFAULT_ACCENT_TOKENS,
  design: createDefaultScanMeLinksDesignV2("bloom"),
  backgroundImageUrl: null,
  backgroundVideoUrl: null,
  destinations: [
    { id: "d1", kind: "custom", label: "Meni", url: "https://example.com", iconKey: "utensils", state: "active" },
    { id: "d2", kind: "reservations", label: "Rezerviši sto", url: "https://example.com", iconKey: "calendar", state: "active" },
    { id: "d3", kind: "instagram", label: "Instagram", url: "https://example.com", iconKey: "instagram", state: "active" },
    { id: "d4", kind: "website", label: "Sajt", url: "https://example.com", iconKey: "globe", state: "active" },
  ],
};

function LinksPreview() {
  return <ScanMeLinksTemplate view={LINKS_VIEW} preview />;
}

// --- Venue fixture (real VenueTemplate, "live" lifecycle) -------------------

function VenuePreview() {
  const view = fixtureView({ status: "live", startsAt: serverNow() - 3600_000 });
  return (
    <VenueTemplate
      view={view}
      lifecycle="live"
      businessSlug="klub-mimeza"
      pastEvents={FIXTURE_ARCHIVE}
      footerLink={null}
    />
  );
}

// --- Memories fixture (real gallery chrome + real PhotoThumb) ----------------
// Composed from the existing memories components with their existing props and
// the existing memories CSS — the real gallery look, not a re-skin. Sample
// photos are local /dev-venue assets so the preview needs no live data.

function samplePhoto(n: number): PhotoImage {
  const url = `/dev-venue/${n}.jpg`;
  return {
    thumbUrl: url,
    avifUrl: url,
    webpUrl: url,
    width: 1200,
    height: 1200,
    thumbWidth: 512,
    thumbHeight: 512,
  };
}

const MEMORIES_PHOTOS = [1, 2, 3, 4, 5, 6].map(samplePhoto);

function MemoriesPreview() {
  return (
    <MemoriesShell>
      <MemoriesMasthead
        spaceName="Uspomene sa venčanja"
        businessName="Restoran Stari Grad"
        logoUrl={null}
      />
      <h2 className={memoriesStyles.pageTitle}>Zajednička galerija</h2>
      <p className={memoriesStyles.socialProof}>Gosti su podelili 42 fotografije</p>
      <ul className={memoriesStyles.photoGrid}>
        {MEMORIES_PHOTOS.map((image, index) => (
          <li key={index} className={memoriesStyles.photoCell}>
            <span className={memoriesStyles.photoButton}>
              <PhotoThumb image={image} alt="" className={memoriesStyles.photoThumb} />
            </span>
          </li>
        ))}
      </ul>
      <MemoriesFooterBrand />
    </MemoriesShell>
  );
}

// --- Explainer previews (Menu = uskoro, Review = Google redirect) ------------

function MenuPreview() {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderIcon}>
        <Clock aria-hidden="true" size={24} />
      </span>
      <p className={styles.placeholderTitle}>{dict.previewMenuTitle}</p>
      <p className={styles.placeholderBody}>{dict.previewMenuBody}</p>
    </div>
  );
}

function ReviewPreview() {
  return (
    <div className={styles.placeholder}>
      <span className={styles.placeholderIcon}>
        <Star aria-hidden="true" size={24} />
      </span>
      <p className={styles.placeholderTitle}>{dict.previewReviewTitle}</p>
      <Image
        src="/images/scanme-review-sticker-example.webp"
        alt=""
        width={190}
        height={190}
        className={styles.placeholderImage}
      />
      <p className={styles.placeholderBody}>{dict.previewReviewBody}</p>
    </div>
  );
}

const PREVIEWS: Record<ServiceId, () => React.JSX.Element> = {
  links: LinksPreview,
  venue: VenuePreview,
  memories: MemoriesPreview,
  menu: MenuPreview,
  review: ReviewPreview,
};

export function ServicePreview({ service }: { service: ServiceId }) {
  const Preview = PREVIEWS[service];
  const name = dict.services[service].name;
  return (
    <div className={styles.wrap}>
      <div
        className={styles.frame}
        role="img"
        aria-label={fmt(dict.previewLabel, { name })}
      >
        <div className={styles.screen}>
          <span className={styles.notch} aria-hidden="true" />
          <div className={styles.stage} aria-hidden="true">
            <Preview />
          </div>
        </div>
      </div>
      <span className={styles.caption}>
        <span className={styles.captionDot} aria-hidden="true" />
        {dict.previewReadOnly}
      </span>
    </div>
  );
}
