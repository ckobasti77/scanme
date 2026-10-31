import Image from "next/image";
import Link from "next/link";
import { CarFront } from "lucide-react";
import type { ReactNode } from "react";
import { fairLocalPhotoUrl, fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import type { FairGarageModelView } from "@/lib/fair-client/garage-view";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import type { FairGarageDict } from "@/lib/i18n/types";
import styles from "./fair-garage.module.css";

// The two-model comparison shared by the garage (`/garaza/poredjenje`) and the
// same-brand comparison of the model page (`/model/{slug}/poredjenje`).

export type FairComparisonRow = {
  key: string;
  group: string;
  label: string;
  values: [string, string];
};

/** Rows in first-seen server order; a row one model lacks shows `missing`. */
export function fairComparisonRows(models: FairGarageModelView[], missing: string): FairComparisonRow[] {
  if (models.length !== 2 || !models.every((model) => model.live)) return [];
  const rows: FairComparisonRow[] = [];
  const order: Array<{ key: string; group: string; label: string }> = [];
  const known = new Set<string>();
  for (const model of models) {
    for (const group of model.live!.specificationGroups) {
      for (const item of group.items) {
        const key = `${group.label}\u0000${item.label}`;
        if (known.has(key)) continue;
        known.add(key);
        order.push({ key, group: group.label, label: item.label });
      }
    }
  }
  for (const item of order) {
    const values = models.map((model) => {
      for (const group of model.live!.specificationGroups) {
        const match = group.items.find(
          (candidate) =>
            group.label === item.group && candidate.label === item.label,
        );
        if (match) return match.value.trim() || missing;
      }
      return missing;
    }) as [string, string];
    rows.push({ ...item, values });
  }
  return rows;
}

function modelPhoto(model: FairGarageModelView, dict: FairGarageDict) {
  return (
    <div className={styles.comparisonPhoto}>
      {model.photoUrl ? (
        <Image
          fill
          sizes="(max-width: 640px) 46vw, 350px"
          src={fairLocalPhotoUrl(model.photoUrl)}
          style={fairVehiclePhotoStyle(model.photoUrl)}
          unoptimized={fairPhotoUnoptimized(fairLocalPhotoUrl(model.photoUrl))}
          alt={dict.modelPhotoAlt
            .replace("{brand}", model.brandName)
            .replace("{model}", model.displayName)}
        />
      ) : (
        <CarFront aria-hidden="true" />
      )}
    </div>
  );
}

export function FairComparisonTable({
  models,
  rows,
  dict,
  price = (model) => <strong>{model.priceText}</strong>,
  cardAction,
  specsFallback,
}: {
  models: FairGarageModelView[];
  rows: FairComparisonRow[];
  dict: FairGarageDict;
  /** Price block of one card; the garage shows the saved price text. */
  price?: (model: FairGarageModelView) => ReactNode;
  /** Extra control under a card (the same-brand switcher). */
  cardAction?: (model: FairGarageModelView, index: number) => ReactNode;
  /** Shown instead of the table while there are no rows (loading, offline). */
  specsFallback?: ReactNode;
}) {
  return (
    <>
      <section className={styles.comparisonModels} aria-label={dict.comparisonTitle}>
        {models.map((model, index) => (
          <article key={model.id}>
            {modelPhoto(model, dict)}
            <span>{model.brandName}</span>
            <h2>{model.displayName}</h2>
            {model.variant ? <p>{model.variant}</p> : null}
            {price(model)}
            <Link href={`/sajam/${model.eventSlug}/model/${model.modelSlug}`}>
              {dict.viewModel}
            </Link>
            {cardAction?.(model, index)}
          </article>
        ))}
      </section>

      {rows.length > 0 ? (
        <section className={styles.specComparison}>
          <h2>{dict.comparisonSpecifications}</h2>
          <div className={styles.specHeader} aria-hidden="true">
            <span />
            {models.map((model) => (
              <strong key={model.id}>{model.displayName}</strong>
            ))}
          </div>
          {rows.map((row, index) => {
            const previousGroup = rows[index - 1]?.group;
            return (
              <div key={row.key} className={styles.specRow}>
                {row.group !== previousGroup ? (
                  <h3>{row.group}</h3>
                ) : null}
                <span>{row.label}</span>
                {row.values.map((value, column) => (
                  <strong key={models[column].id}>
                    <span className="sr-only">{models[column].displayName}: </span>
                    {value}
                  </strong>
                ))}
              </div>
            );
          })}
        </section>
      ) : (
        specsFallback ?? null
      )}
    </>
  );
}
