"use client";

import { useEffect, useState } from "react";
import type { FairSponsoredModelCard, FairSponsoredRotationView } from "@/lib/fair-contract";
import { createEmptyFairGarageDocument, readFairGarage, writeFairGarage, FAIR_GARAGE_CHANGE_EVENT, FAIR_GARAGE_MODEL_CHANGE_EVENT } from "@/lib/fair-client/garage-store";
import { getDict } from "@/lib/i18n";
import { SponsoredStrip } from "../garage/fair-garage";
import styles from "./amf-topographic-map.module.css";

/** Shared recommendation layout; map clicks only update the local garage. */
export function AmfMapSponsor({ item, rotation, display }: {
  item: FairSponsoredModelCard;
  rotation: FairSponsoredRotationView | null;
  display: boolean;
}) {
  const [document, setDocument] = useState(() => createEmptyFairGarageDocument());
  useEffect(() => {
    const sync = () => setDocument(readFairGarage(window.localStorage).document);
    const timer = setTimeout(sync, 0);
    window.addEventListener(FAIR_GARAGE_CHANGE_EVENT, sync);
    return () => { clearTimeout(timer); window.removeEventListener(FAIR_GARAGE_CHANGE_EVENT, sync); };
  }, []);
  return <aside className={styles.sponsor} data-amf-sponsor="">
    <SponsoredStrip inline display={display} event={{ publicSlug: item.eventSlug, sponsoredRotation: rotation }} document={document} dict={getDict("fair-garage")} onDocument={next => {
      const result = writeFairGarage(window.localStorage, next);
      if (!result.ok) return false;
      setDocument(next);
      window.dispatchEvent(new Event(FAIR_GARAGE_CHANGE_EVENT));
      window.dispatchEvent(new Event(FAIR_GARAGE_MODEL_CHANGE_EVENT));
      return true;
    }} />
  </aside>;
}
