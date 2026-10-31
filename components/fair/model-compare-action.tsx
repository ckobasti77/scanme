"use client";

import { AnimatePresence } from "framer-motion";
import { GitCompareArrows } from "lucide-react";
import { useState } from "react";
import { useFairHistoryLayer } from "@/lib/fair-client/history-layer";
import type { FairCompareOption } from "@/lib/fair-server/brand-compare";
import type { FairModelDict } from "@/lib/i18n";
import { FairCompareSheet, fairBrandCompareHref } from "./model-compare-sheet";
import { useFairModelInteractions } from "./model-interactions";

/** "Uporedi" beside the garage dock: opens the same-brand list (owner, AMF 31 Oct 2026). */
export function ModelCompareAction({
  eventSlug,
  modelSlug,
  options,
  dict,
}: {
  eventSlug: string;
  modelSlug: string;
  options: FairCompareOption[];
  dict: FairModelDict;
}) {
  const { model } = useFairModelInteractions();
  const [open, setOpen] = useState(false);
  const requestClose = useFairHistoryLayer(open, () => setOpen(false), "compare");

  return (
    <>
      <button type="button" className="fair-save-compare" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <GitCompareArrows aria-hidden="true" />
        <span>{dict.compareAction}</span>
      </button>
      <AnimatePresence>
        {open ? (
          <FairCompareSheet
            key="compare"
            brandName={model.brandName}
            options={options}
            hrefFor={(option) => fairBrandCompareHref(eventSlug, modelSlug, option.slug)}
            onRequestClose={requestClose}
            dict={dict}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
