"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { CarFront, ChevronRight } from "lucide-react";
import { fairModelPriceValue } from "@/lib/fair-client/model-price";
import { fairLocalPhotoUrl, fairPhotoUnoptimized } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import type { FairCompareOption } from "@/lib/fair-server/brand-compare";
import { fmt, type FairModelDict } from "@/lib/i18n";
import { FairSheet } from "./fair-sheet";

function priceText(text: string, dict: FairModelDict) {
  const value = fairModelPriceValue(text, dict);
  return value === dict.priceOnRequest ? `${dict.priceLabel} ${value}` : value;
}

/** The compare URL of `modelSlug` against one other model of its brand. */
export function fairBrandCompareHref(eventSlug: string, modelSlug: string, otherSlug: string) {
  return `/sajam/${eventSlug}/model/${modelSlug}/poredjenje?sa=${encodeURIComponent(otherSlug)}`;
}

/**
 * "Uporedi sa modelom {brand}": the other published models of the brand, each
 * a link to the comparison. Used on the model page and inside the comparison
 * (switching the second model). A choice closes the sheet (its history
 * layer), then navigates; `replace` swaps the comparison URL in place.
 */
export function FairCompareSheet({
  brandName,
  options,
  currentId,
  hrefFor,
  replace = false,
  onRequestClose,
  dict,
}: {
  brandName: string;
  options: FairCompareOption[];
  /** The model already shown as the second column (marked, not a link). */
  currentId?: string;
  hrefFor: (option: FairCompareOption) => string;
  replace?: boolean;
  onRequestClose: (afterClose?: () => void) => void;
  dict: FairModelDict;
}) {
  const router = useRouter();
  return (
    <FairSheet
      variant="bottom"
      titleId="fair-compare-title"
      eyebrow={brandName}
      title={fmt(dict.compareSheetTitle, { brand: brandName })}
      subtitle={dict.compareSheetSubtitle}
      closable
      closeLabel={dict.closeSheet}
      onRequestClose={() => onRequestClose()}
    >
      <FairCompareList
        options={options}
        currentId={currentId}
        hrefFor={hrefFor}
        onChoose={(href) =>
          onRequestClose(() => (replace ? router.replace(href, { scroll: false }) : router.push(href)))
        }
        onCurrent={() => onRequestClose()}
        dict={dict}
      />
    </FairSheet>
  );
}

/** The same-brand model list of the sheet; also the choice list of an empty comparison. */
export function FairCompareList({
  options,
  currentId,
  hrefFor,
  onChoose,
  onCurrent,
  dict,
}: {
  options: FairCompareOption[];
  currentId?: string;
  hrefFor: (option: FairCompareOption) => string;
  onChoose: (href: string) => void;
  onCurrent?: () => void;
  dict: FairModelDict;
}) {
  return (
    <ul className="fair-compare-list">
      {options.map((option) => {
        const href = hrefFor(option);
        const photo = fairLocalPhotoUrl(option.photoUrl);
        const current = option.id === currentId;
        return (
          <li key={option.id}>
            <a
              href={href}
              aria-current={current ? "true" : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                if (current) onCurrent?.();
                else onChoose(href);
              }}
            >
              <span className="fair-compare-list__photo" aria-hidden="true">
                {photo ? (
                  <Image
                    fill
                    sizes="96px"
                    src={photo}
                    alt=""
                    unoptimized={fairPhotoUnoptimized(photo)}
                    style={fairVehiclePhotoStyle(photo)}
                  />
                ) : (
                  <CarFront />
                )}
              </span>
              <span className="fair-compare-list__copy">
                <strong>{option.displayName}</strong>
                {option.variant ? <small>{option.variant}</small> : null}
                <span>{priceText(option.priceText, dict)}</span>
              </span>
              <ChevronRight className="fair-compare-list__chevron" aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
