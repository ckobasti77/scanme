"use client";

import Image from "next/image";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fmt } from "@/lib/i18n";
import type { FairBrandDict } from "@/lib/i18n/types";
import styles from "./brand-lead-success.module.css";

// Brand-page confirmation (card 06a, mockup sheet 3): what the visitor sees after
// FairBrandLeadSheet's onSent flips the sheet to the success state. The eyebrow, the body
// and the back label come from the fair-brand dictionary (kind-picked here, counted
// through modelsLine there); the sent models and the contact line are the caller's data,
// verbatim. The mockup's "confirmation sent to your e-mail" row is NOT rendered — the
// system never sends the visitor an email, so promising one on screen would lie.
export function FairBrandLeadSuccess({ kind, brandName, models, contactLine, onAnother, onBack, dict }: {
  kind: "testDrive" | "interest";
  brandName: string;
  /** The models this lead actually sent, in the brand's order. priceText is the string
   * the card carries (priceText, never a number) — it is shown as sent, never reparsed. */
  models: { id: string; name: string; priceText: string; photoUrl?: string }[];
  /** "<ime> · <telefon ili email>" as the sheet's contact came it. */
  contactLine: string;
  onAnother: () => void;
  onBack: () => void;
  /** The page's fair-brand dictionary: eyebrow, body, back label, modelsLine. */
  dict: FairBrandDict;
}) {
  const eyebrow = kind === "testDrive"
    ? dict.successEyebrowTestDrive(models.length)
    : dict.successEyebrowInterest(models.length);
  const body = kind === "testDrive"
    ? fmt(dict.successBodyTestDrive, { brand: brandName })
    : fmt(dict.successBodyInterest, { brand: brandName });

  return (
    <div className={styles.wrap}>
      <div className={styles.mark} aria-hidden="true">
        {/* Same check geometry as brand-model-row's CheckIcon, with pathLength={100} so the
            dash values in the stylesheet are scale-stable (the passport hold-ring's trick). */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path className={styles.draw} d="M5 12.5l4.5 4.5L19 7.5" pathLength={100} />
        </svg>
      </div>
      <h2 className={styles.title}>{dict.successTitle}</h2>
      <p className={styles.body}>{body}</p>
      <div className={styles.summary}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <ul className={styles.models}>
          {models.map((model) => (
            <li key={model.id} className={styles.model}>
              {model.photoUrl ? (
                <Image
                  className={styles.photo}
                  src={model.photoUrl}
                  width={56}
                  height={40}
                  alt={model.name}
                  loading="lazy"
                  unoptimized={fairPhotoUnoptimized(model.photoUrl)}
                  style={fairVehiclePhotoStyle(model.photoUrl)}
                />
              ) : (
                // No photo: the tonal initial, the same fallback family as model rows.
                <span className={`${styles.photo} ${styles.photoMark}`} aria-hidden="true">{model.name.slice(0, 1).toUpperCase()}</span>
              )}
              <span className={styles.modelInfo}>
                <strong className={styles.modelName}>{model.name}</strong>
                <span className={styles.modelPrice}>{model.priceText}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.contact}>{contactLine}</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={`${styles.btn} ${styles.dark}`} onClick={onAnother}>
          {dict.successAnother}
        </button>
        <button type="button" className={`${styles.btn} ${styles.light}`} onClick={onBack}>
          {fmt(dict.successBack, { brand: brandName })}
        </button>
      </div>
    </div>
  );
}
