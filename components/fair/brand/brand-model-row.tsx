"use client";

import Image from "next/image";
import Link from "next/link";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import type { FairBrandDict } from "@/lib/i18n/types";
import type { FairBrandPageModel } from "@/lib/fair-server/brand-page";
import styles from "./brand-model-row.module.css";

// Steering wheel as in docs/mockups/stranica-brenda-mockup.html IC.steer — the drive pill's mark.
function SteerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 21s-7-4.2-7-9" />
      <path d="M12 21s7-4.2 7-9" />
      <path d="M12 9.8V3" />
      <path d="m5.1 10.5 5.1-2.2" />
      <path d="m13.8 8.3 5.1 2.2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** One packaged model of the brand: the same photo pipeline as the model page (unoptimized
 * local/demo paths, vehicle focal crop), price verbatim, and the drive pill. The row opens the
 * model page; the pill alone calls `onDrive([slug])` so the drive form opens pre-selected.
 * `requested` = the visitor already sent this model while on this page (page state, not kept
 * across reloads) — then the pill is the green "Prijavljeno" stamp and only the row link
 * remains. */
export function FairBrandModelRow({ dict, model, brandName, eventSlug, requested, onDrive }: {
  dict: FairBrandDict;
  model: FairBrandPageModel;
  brandName: string;
  eventSlug: string;
  requested: boolean;
  onDrive: (slugs: string[]) => void;
}) {
  const photo = model.photoUrl;
  const drive = (
    requested ? (
      <span className={`${styles.pill} ${styles.ok}`}><CheckIcon />{dict.requestedPill}</span>
    ) : (
      <button
        type="button"
        className={styles.pill}
        onClick={(event) => {
          // The pill is inside the row link: keep the click from opening the model page.
          event.preventDefault();
          event.stopPropagation();
          onDrive([model.slug]);
        }}
      ><SteerIcon />{fairModelSr.requestTestDrive}</button>
    )
  );

  return (
    <Link className={styles.row} href={`/sajam/${eventSlug}/model/${model.slug}`}>
      {photo ? (
        <Image
          className={styles.photo}
          src={photo}
          width={118}
          height={88}
          alt={model.name}
          loading="lazy"
          unoptimized={fairPhotoUnoptimized(photo)}
          style={fairVehiclePhotoStyle(photo)}
        />
      ) : (
        // No photo: the tonal initial, same fallback family as the model page's visual mark.
        <div className={`${styles.photo} ${styles.photoMark}`} aria-hidden="true">{model.name.slice(0, 1).toUpperCase()}</div>
      )}
      <span className={styles.info}>
        <span className={styles.eyebrow}>{brandName}</span>
        <strong className={styles.name}>{model.name}</strong>
        <span className={styles.price}>{model.priceText}</span>
        {drive}
      </span>
    </Link>
  );
}
