"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, ThumbsUp } from "lucide-react";
import type { CSSProperties } from "react";
import { TbSteeringWheel } from "react-icons/tb";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fairBrandVector, type FairBrandVector } from "@/lib/fair-brand-logo";
import { fairMapLogo } from "@/lib/fair-map/logos";
import type { FairSalonBrand } from "@/lib/fair-salon";
import type { FairBrandPageModel } from "@/lib/fair-server/brand-page";
import { fmt } from "@/lib/i18n/format";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import { fairSalonSr as dict } from "@/lib/i18n/sr/fair-salon";
import styles from "./brand-showroom.module.css";

/** The brand's vector mark as an inline SVG in the given colour (a file mark through a CSS mask). */
function BrandMark({ mark, className }: { mark: FairBrandVector; className: string }) {
  if (mark.kind === "path") {
    return (
      <svg className={className} viewBox={mark.box ?? "0 0 24 24"} aria-hidden="true" focusable="false">
        <path d={mark.path} fill="currentColor" />
      </svg>
    );
  }
  const style = { aspectRatio: `${mark.width} / ${mark.height}`, "--mark": `url(${mark.src})` } as CSSProperties;
  return <span className={`${className} ${styles.markFile}`} style={style} aria-hidden="true" />;
}

/** Auto Expo brand page: a branded header with the two lead actions, then one card per car. */
export function FairBrandShowroom({ brand, logoUrl, models, eventSlug, requestedIds, onDrive, onInterest }: {
  brand: FairSalonBrand;
  /** The brand's uploaded logo: used for the heading only when there is no vector mark. */
  logoUrl?: string;
  models: readonly FairBrandPageModel[];
  eventSlug: string;
  requestedIds: readonly string[];
  onDrive: (modelId: string | null) => void;
  onInterest: (modelId: string | null) => void;
}) {
  // Heading: the vector mark in the brand colour, else a transparent logo file, else the name.
  // The same mark, oversized and faint, fills the top-right corner over a glow in the brand colour.
  const mark = fairBrandVector(brand.name);
  const logo = mark ? null : fairMapLogo(logoUrl);
  const tone = mark?.hex ?? "var(--fair-accent)";
  const aspect = mark ? (mark.kind === "path" ? (mark.box ? 24 / 9 : 1) : mark.width / mark.height) : (logo?.aspect ?? 1);
  return (
    <div className={styles.wrap}>
      <header className={styles.hero} style={{ "--brand-tone": tone } as CSSProperties} data-logo={aspect >= 1.6 ? "wide" : "square"}>
        <span className={styles.glow} aria-hidden="true" />
        {mark ? <BrandMark mark={mark} className={styles.watermark} /> : null}
        {mark ? (
          <h1 className={styles.logoHeading}>
            <BrandMark mark={mark} className={styles.logo} />
            <span className={styles.srOnly}>{brand.name}</span>
          </h1>
        ) : logo?.thumb ? (
          <h1 className={styles.logoHeading}>
            {/* eslint-disable-next-line @next/next/no-img-element -- small local logo copy of known size */}
            <img className={styles.logo} src={logo.src} alt={brand.name} style={{ aspectRatio: String(logo.aspect) }} />
          </h1>
        ) : (
          <h1>{brand.name}</h1>
        )}
        {/* The model page's action buttons: the test drive highlighted, interest plain. */}
        <div className={`fair-action-grid ${styles.heroActions}`}>
          <button type="button" data-highlight="true" onClick={() => onDrive(null)}>
            <span className="fair-action-highlight__shine" aria-hidden="true" />
            <TbSteeringWheel aria-hidden="true" />
            <span>{dict.tileDrive}</span>
          </button>
          <button type="button" onClick={() => onInterest(null)}>
            <ThumbsUp aria-hidden="true" />
            <span>{fairModelSr.submitInterest}</span>
          </button>
        </div>
        <a className={styles.site} href={brand.siteUrl} target="_blank" rel="noopener noreferrer">
          {fmt(dict.siteLink, { site: brand.siteLabel })}
          <ExternalLink aria-hidden="true" />
        </a>
      </header>

      <ul className={styles.grid} data-count={models.length}>
        {models.map((model) => {
          const cutout = brand.spots.find((spot) => spot.modelSlug === model.slug)?.cutout;
          const href = `/sajam/${eventSlug}/model/${model.slug}`;
          const sent = requestedIds.includes(model.id);
          return (
            <li key={model.id} className={styles.card}>
              {/* A cut-out stands on the card's floor: its tyre line (`cutout.ground`) sits on the same
                  ground line in every card, at the same width, with a contact shadow taken from its
                  own silhouette. A full photo keeps its own ground (the model page's crop). */}
              <Link href={href} className={styles.photo} data-floor={cutout ? "" : undefined} tabIndex={-1} aria-hidden="true">
                {cutout ? (
                  <Image
                    src={cutout.src}
                    alt=""
                    width={cutout.width}
                    height={cutout.height}
                    sizes="(max-width: 767px) 80vw, 420px"
                    className={styles.cutout}
                    style={{ "--ground": cutout.ground } as CSSProperties}
                  />
                ) : model.photoUrl ? (
                  <Image
                    src={model.photoUrl}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 100vw, 520px"
                    unoptimized={fairPhotoUnoptimized(model.photoUrl)}
                    style={fairVehiclePhotoStyle(model.photoUrl)}
                  />
                ) : null}
              </Link>
              <div className={styles.body}>
                <h2><Link href={href}>{model.name}</Link></h2>
                <p className={styles.price}>{model.priceText}</p>
                {model.priceSecondaryText ? <p className={styles.priceNote}>{model.priceSecondaryText}</p> : null}
                {model.highlights?.length ? (
                  <dl className={styles.specs}>
                    {model.highlights.map((item) => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {/* The same two actions as the header, stacked full width: test drive, then interest. */}
                <div className={`fair-action-grid ${styles.cardActions}`}>
                  {sent ? (
                    <span className="fair-action-done"><Check aria-hidden="true" />{dict.panelSent}</span>
                  ) : (
                    <button type="button" data-highlight="true" onClick={() => onDrive(model.id)}>
                      <span className="fair-action-highlight__shine" aria-hidden="true" />
                      <TbSteeringWheel aria-hidden="true" />
                      <span>{dict.tileDrive}</span>
                    </button>
                  )}
                  <button type="button" onClick={() => onInterest(model.id)}>
                    <ThumbsUp aria-hidden="true" />
                    <span>{fairModelSr.submitInterest}</span>
                  </button>
                  <Link href={href} className={styles.details}>
                    {dict.panelDetails}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
