"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import styles from "./brand-model-picker.module.css";

/** Model picker of the brand lead sheet on /sajam/<event>/brend/<brand>: every packaged
 * model is one of the sheet's option rows (`.fair-survey-option`, the survey's selectable
 * row) with the model photo through the app's pipeline and the price verbatim. Texts come in
 * through props (`label`, `countText`); no i18n is read here. `onToggle(id)` keeps the
 * selection in the parent. */
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
    <div className={styles.picker}>
      <div className={styles.head}>
        <span>{label}</span>
        <span className={styles.count}>{countText}</span>
      </div>
      <ul role="list" className={`fair-survey-options ${styles.list}`}>
        {models.map((model) => {
          const checked = selectedIds.includes(model.id);
          return (
            <li key={model.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                className={`fair-survey-option ${styles.option}`}
                onClick={() => onToggle(model.id)}
              >
                <span className={styles.photo}>
                  {model.photoUrl ? (
                    <Image
                      fill
                      sizes="64px"
                      src={model.photoUrl}
                      alt=""
                      unoptimized={fairPhotoUnoptimized(model.photoUrl)}
                      style={fairVehiclePhotoStyle(model.photoUrl)}
                    />
                  ) : null}
                </span>
                <span className={styles.info}>
                  <strong>{model.name}</strong>
                  <span>{model.priceText}</span>
                </span>
                <span className="fair-survey-option__dot" aria-hidden="true">
                  <Check />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
