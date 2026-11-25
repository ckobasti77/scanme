"use client";

import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import styles from "./brand-model-picker.module.css";

// White check inside the selected square — the same mark as the brand row's "Prijavljeno" pill.
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Model picker for the drive flow on /sajam/<event>/brend/<brand> (card 05c): every packaged
 * model is a whole-row checkbox button — the photo is the same image pipeline as the brand row
 * (`fairPhotoUnoptimized` + `fairVehiclePhotoStyle`), price verbatim. Texts come in through
 * props (`label`, `countText`); no i18n is read here. `onToggle(id)` keeps the selection in the
 * parent (card 06 persists it across reloads). */
export function FairBrandModelPicker({ models, selectedIds, onToggle, label, countText }: {
  models: { id: string; name: string; priceText: string; photoUrl?: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Title above the list. */
  label: string;
  /** Counter right of the title, e.g. "2 izabrana". */
  countText: string;
}) {
  return (
    <div>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>{countText}</span>
      </div>
      <ul role="list" className={styles.pick}>
        {models.map((model) => {
          const checked = selectedIds.includes(model.id);
          return (
            <li key={model.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                className={`${styles.pk} ${checked ? styles.on : ""}`}
                onClick={() => onToggle(model.id)}
              >
                {model.photoUrl ? (
                  <img
                    className={styles.photo}
                    src={model.photoUrl}
                    alt=""
                    width={62}
                    height={42}
                    loading="lazy"
                    // Same pipeline as brand-model-row.tsx: absolute URLs skip next/image
                    // (off-domain exhibitor hosts 400 without it); focal crop on the vehicle.
                    style={fairVehiclePhotoStyle(model.photoUrl)}
                  />
                ) : (
                  // No photo: the empty block of the exact same size (mockup .pk .noimg).
                  <span className={`${styles.photo} ${styles.noimg}`} aria-hidden="true" />
                )}
                <span className={styles.info}>
                  <strong className={styles.name}>{model.name}</strong>
                  <span className={styles.price}>{model.priceText}</span>
                </span>
                <span className={`${styles.ck} ${checked ? styles.ckOn : ""}`} aria-hidden="true">
                  {checked ? <CheckIcon /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
