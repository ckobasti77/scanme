// The Venue template root (TASK-09, RFC-001 §2.5). Applies the --venue-*
// custom properties from createTokenCompiler("venue"), renders the background
// through the engine's backgroundPresentation (media backgrounds get a real
// media layer here, with the base token remapped to the venue page colour so
// no Links-namespaced token is ever emitted), and lays out the masthead, the
// ordered block column, and the footer. Server component; its own CSS module —
// no shared stylesheet with Links, ever.

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { rgba } from "@/lib/design-engine/color";
import {
  clampVenueDesign,
  compileVenueTokens,
  type VenueDesign,
} from "@/lib/design-engine/venue-tokens";
import { venueSr as dict } from "@/lib/i18n/sr/venue";
import { formatBelgradeDate, formatBelgradeTime } from "@/lib/venue-calendar";
import { VenueBlockRender } from "./blocks/registry";
import type {
  ArchivedEventView,
  VenueLifecycle,
  VenuePageView,
  VenueRenderContext,
} from "./venue-view";
import { viewBlocks } from "./venue-view";
import styles from "./venue-template.module.css";

// Root token style + data attributes for one design. Media backgrounds remap
// the base-image token locally (the engine's media branch is a Links
// render-path detail — see lib/design-engine/venue-tokens.ts).
function rootPresentation(design: VenueDesign) {
  const tokens = compileVenueTokens(design) as Record<string, string>;
  const background = design.background;
  if (background.category === "media") {
    tokens["--venue-background-base-image"] =
      "linear-gradient(var(--venue-page), var(--venue-page))";
  }
  return {
    style: tokens as CSSProperties,
    scale: design.typography.scale,
    align: design.typography.alignment,
    background,
  };
}

function MediaBackgroundLayer({
  design,
  imageUrl,
  videoUrl,
}: {
  design: VenueDesign;
  imageUrl: string | null;
  videoUrl: string | null;
}) {
  const background = design.background;
  if (background.category !== "media") return null;
  const media =
    background.mediaType === "video"
      ? videoUrl
        ? { kind: "video" as const, url: videoUrl }
        : null
      : imageUrl
        ? { kind: "image" as const, url: imageUrl }
        : null;
  const layerStyle = {
    "--venue-media-fit": background.fit,
    "--venue-media-position": `${background.positionX}% ${background.positionY}%`,
    "--venue-media-zoom": String(background.zoom),
  } as CSSProperties;
  const overlay =
    background.overlayOpacity > 0
      ? rgba(background.overlayColor, background.overlayOpacity)
      : null;
  return (
    <>
      {media ? (
        <div className={styles.backgroundMedia} style={layerStyle} aria-hidden="true">
          {media.kind === "video" ? (
            <video src={media.url} autoPlay muted loop playsInline />
          ) : (
            /* Decorative full-bleed backdrop, sized by the layer box — a plain
               element (not next/image) keeps object-position/zoom exact. */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" />
          )}
        </div>
      ) : null}
      {overlay ? (
        <div
          className={styles.backgroundOverlay}
          style={{ "--venue-media-overlay": overlay } as CSSProperties}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function LifecycleRibbon({
  lifecycle,
  startsAt,
}: {
  lifecycle: VenueLifecycle;
  startsAt: number | null;
}) {
  return (
    <div className={styles.ribbon}>
      {lifecycle === "live" ? (
        <span className={`${styles.badge} ${styles.badgeLive}`}>
          <span className={styles.liveDot} aria-hidden="true" />
          {dict.liveBadge}
        </span>
      ) : (
        <span className={styles.badge}>
          {lifecycle === "before" ? dict.beforeBadge : dict.endedBadge}
        </span>
      )}
      {startsAt !== null ? (
        <span className={styles.ribbonDate}>
          {formatBelgradeDate(startsAt)} · {formatBelgradeTime(startsAt)}
        </span>
      ) : null}
    </div>
  );
}

function Masthead({
  logoUrl,
  eyebrow,
  title,
  lifecycle,
  startsAt,
}: {
  logoUrl: string | null;
  eyebrow: string;
  title: string;
  lifecycle: VenueLifecycle | null;
  startsAt: number | null;
}) {
  return (
    <header className={styles.masthead}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.logo} src={logoUrl} alt="" />
      ) : null}
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
      {lifecycle ? (
        <LifecycleRibbon lifecycle={lifecycle} startsAt={startsAt} />
      ) : null}
    </header>
  );
}

function Footer({
  link,
}: {
  link: { href: string; label: string } | null;
}) {
  return (
    <footer className={styles.footer}>
      <p className={styles.footerBrand}>{dict.poweredBy}</p>
      {link ? (
        <Link className={styles.footerLink} href={link.href}>
          {link.label}
        </Link>
      ) : null}
    </footer>
  );
}

// --- the published-event template --------------------------------------------

export function VenueTemplate({
  view,
  lifecycle,
  businessSlug,
  pastEvents = null,
  footerLink = null,
  children,
}: {
  view: VenuePageView;
  lifecycle: VenueLifecycle;
  businessSlug: string;
  pastEvents?: ArchivedEventView[] | null;
  footerLink?: { href: string; label: string } | null;
  children?: ReactNode;
}) {
  const design = clampVenueDesign(view.design as VenueDesign | null);
  const { style, scale, align } = rootPresentation(design);

  const ctx: VenueRenderContext = {
    businessSlug,
    eventSlug: view.event.slug,
    eventTitle: view.event.title,
    displayName: view.displayName,
    eventStartsAt: view.event.startsAt,
    eventEndsAt: view.event.endsAt,
    lifecycle,
    pastEvents,
  };

  return (
    <div
      className={styles.root}
      style={style}
      data-venue-scale={scale}
      data-venue-align={align}
    >
      <div className={styles.backgroundDetail} aria-hidden="true" />
      <MediaBackgroundLayer
        design={design}
        imageUrl={view.backgroundImageUrl}
        videoUrl={view.backgroundVideoUrl}
      />
      <div className={styles.frame}>
        <Masthead
          logoUrl={view.logoUrl}
          eyebrow={view.displayName}
          title={view.event.title}
          lifecycle={lifecycle}
          startsAt={view.event.startsAt}
        />
        {lifecycle === "after" ? (
          <p className={styles.stateBody}>{dict.eventPageEndedNote}</p>
        ) : null}
        <main className={styles.blocks}>
          {viewBlocks(view).map((block) => (
            <VenueBlockRender key={block.base.id} block={block} ctx={ctx} />
          ))}
          {children}
        </main>
        <Footer link={footerLink} />
      </div>
    </div>
  );
}

// --- the state shell (before-empty / after / inactive / archive) --------------
// Same visual system under the clamped default design — used whenever there is
// no published event design to dress the page with.

export function VenueStateScreen({
  badge,
  title,
  eyebrow,
  logoUrl,
  body,
  actions = null,
  footerLink = null,
  children,
}: {
  badge: VenueLifecycle | null;
  title: string;
  eyebrow: string;
  logoUrl: string | null;
  body: string | null;
  actions?: ReactNode;
  footerLink?: { href: string; label: string } | null;
  children?: ReactNode;
}) {
  const design = clampVenueDesign(null);
  const { style, scale, align } = rootPresentation(design);

  return (
    <div
      className={styles.root}
      style={style}
      data-venue-scale={scale}
      data-venue-align={align}
    >
      <div className={styles.backgroundDetail} aria-hidden="true" />
      <div className={styles.frame}>
        <Masthead
          logoUrl={logoUrl}
          eyebrow={eyebrow}
          title={title}
          lifecycle={badge}
          startsAt={null}
        />
        {body ? <p className={styles.stateBody}>{body}</p> : null}
        {actions ? <div className={styles.stateActions}>{actions}</div> : null}
        <main className={styles.blocks} style={{ marginTop: "1.5rem" }}>
          {children}
        </main>
        <Footer link={footerLink} />
      </div>
    </div>
  );
}
