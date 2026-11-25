"use client";

import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { TbSteeringWheel } from "react-icons/tb";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import type { FairBrandDict } from "@/lib/i18n/types";
import type { FairBrandPageModel } from "@/lib/fair-server/brand-page";
import styles from "./brand-model-row.module.css";

/** One packaged model of the brand, as a garage-style card row: photo through the same pipeline
 * as the passport and garage (`next/image` fill + `fairPhotoUnoptimized` +
 * `fairVehiclePhotoStyle`), price verbatim, and the model page's test-drive button at row size.
 * The row opens the model page; the button alone calls `onDrive([slug])` so the drive form opens
 * pre-selected. `requested` = the visitor already sent this model while on this page (page
 * state, not kept across reloads) — then the button's place shows "Prijavljeno". */
export function FairBrandModelRow({ dict, model, brandName, eventSlug, requested, onDrive }: {
  dict: FairBrandDict;
  model: FairBrandPageModel;
  brandName: string;
  eventSlug: string;
  requested: boolean;
  onDrive: (slugs: string[]) => void;
}) {
  const photo = model.photoUrl;
  return (
    <Link className={styles.row} href={`/sajam/${eventSlug}/model/${model.slug}`}>
      <span className={styles.photo}>
        {photo ? (
          <Image
            fill
            sizes="112px"
            src={photo}
            alt={model.name}
            loading="lazy"
            unoptimized={fairPhotoUnoptimized(photo)}
            style={fairVehiclePhotoStyle(photo)}
          />
        ) : (
          // No photo: the tonal initial on the garage's warm photo ground.
          <span className={styles.photoMark} aria-hidden="true">{model.name.slice(0, 1).toUpperCase()}</span>
        )}
      </span>
      <span className={styles.info}>
        <span className={styles.eyebrow}>{brandName}</span>
        <strong className={styles.name}>{model.name}</strong>
        <span className={styles.price}>{model.priceText}</span>
        <span className="fair-action-grid" data-count="1" data-size="compact">
          {requested ? (
            <span className="fair-action-done"><Check aria-hidden="true" />{dict.requestedPill}</span>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                // The button is inside the row link: keep the click from opening the model page.
                event.preventDefault();
                event.stopPropagation();
                onDrive([model.slug]);
              }}
            ><TbSteeringWheel aria-hidden="true" /><span>{fairModelSr.requestTestDrive}</span></button>
          )}
        </span>
      </span>
    </Link>
  );
}
