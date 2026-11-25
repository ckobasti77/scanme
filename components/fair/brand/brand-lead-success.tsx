"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { fmt } from "@/lib/i18n";
import type { FairBrandDict } from "@/lib/i18n/types";
import passport from "../passport/stamp-passport.module.css";
import styles from "./brand-lead-success.module.css";

// Brand-page confirmation (mockup sheet 3): what the visitor sees after
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
        <Check />
      </div>
      <h2 className={styles.title}>{dict.successTitle}</h2>
      <p className={styles.body}>{body}</p>
      <div className={styles.summary}>
        <p className={passport.eyebrow}>{eyebrow}</p>
        <ul className={styles.models}>
          {models.map((model) => (
            <li key={model.id} className={styles.model}>
              <span className={styles.photo}>
                {model.photoUrl ? (
                  <Image
                    fill
                    sizes="64px"
                    src={model.photoUrl}
                    alt={model.name}
                    unoptimized={fairPhotoUnoptimized(model.photoUrl)}
                    style={fairVehiclePhotoStyle(model.photoUrl)}
                  />
                ) : null}
              </span>
              <span className={styles.modelInfo}>
                <strong>{model.name}</strong>
                <span>{model.priceText}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className={styles.contact}>{contactLine}</p>
      </div>
      {/* The sheet footer's button pair (fair-sheet__primary / __secondary). */}
      <div className={styles.actions}>
        <button type="button" className="fair-sheet__primary" onClick={onAnother}>
          {dict.successAnother}
        </button>
        <button type="button" className="fair-sheet__secondary" onClick={onBack}>
          {fmt(dict.successBack, { brand: brandName })}
        </button>
      </div>
    </div>
  );
}
