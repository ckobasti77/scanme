"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import { FairBrandIcon } from "../brand-icons";
import type { FairSalonBrand } from "@/lib/fair-salon";
import type { FairBrandPageModel } from "@/lib/fair-server/brand-page";
import { fmt } from "@/lib/i18n/format";
import { fairSalonSr as dict } from "@/lib/i18n/sr/fair-salon";
import styles from "./brand-showroom.module.css";

/** Auto Expo brand page: a clear header with the two lead actions, then one card per car. */
export function FairBrandShowroom({ brand, models, eventSlug, requestedIds, onDrive, onInterest }: {
  brand: FairSalonBrand;
  models: readonly FairBrandPageModel[];
  eventSlug: string;
  requestedIds: readonly string[];
  onDrive: (modelId: string | null) => void;
  onInterest: (modelId: string | null) => void;
}) {
  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <span className={styles.mark} aria-hidden="true"><FairBrandIcon brandSlug={brand.brandSlug} /></span>
        <h1>{brand.name}</h1>
        <p>{fmt(dict.salonText, { brand: brand.name })}</p>
        <div className={styles.heroActions}>
          <button type="button" className={styles.primary} onClick={() => onDrive(null)}>
            <TbSteeringWheel aria-hidden="true" />
            {dict.leadDrive}
          </button>
          <button type="button" className={styles.secondary} onClick={() => onInterest(null)}>
            {dict.leadInterest}
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
          const photo = cutout?.src ?? model.photoUrl;
          const href = `/sajam/${eventSlug}/model/${model.slug}`;
          const sent = requestedIds.includes(model.id);
          return (
            <li key={model.id} className={styles.card}>
              <Link href={href} className={styles.photo} tabIndex={-1} aria-hidden="true">
                {photo ? (
                  <Image
                    src={photo}
                    alt=""
                    fill
                    sizes="(max-width: 767px) 100vw, 520px"
                    className={cutout ? styles.cutout : styles.cover}
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
                <div className={styles.cardActions}>
                  {sent ? (
                    <span className={styles.sent}><Check aria-hidden="true" />{dict.panelSent}</span>
                  ) : (
                    <button type="button" className={styles.primary} onClick={() => onDrive(model.id)}>
                      <TbSteeringWheel aria-hidden="true" />
                      {dict.tileDrive}
                    </button>
                  )}
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
