"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { MapPin } from "lucide-react";
import type { FairSponsoredModelCard, FairSponsoredRotationView } from "@/lib/fair-contract";
import { fairLocalPhotoUrl } from "@/lib/fair-client/photo-url";
import { fairVehiclePhotoStyle } from "@/lib/fair-client/vehicle-photo";
import { FairBrandMark } from "../garage/fair-brand-mark";
import dock from "../garage/fair-garage.module.css";
import { amfMapSr as dict } from "./amf-map-copy";
import styles from "./amf-topographic-map.module.css";

/** Same photo/name/segments treatment as the existing garage dock, without a save action. */
export function AmfMapSponsor({ item, slotNumber, rotation, display, onShowStand }: {
  item: FairSponsoredModelCard;
  slotNumber: number;
  rotation: FairSponsoredRotationView | null;
  display: boolean;
  onShowStand: (() => void) | null;
}) {
  const reduced = useReducedMotion();
  const index = rotation?.items.findIndex((entry) => entry.eventModelId === item.eventModelId) ?? 0;
  const publicLabel = (label: string) => label.replace(/^TEST\s+/i, "").replace(/(?:_| )T$/i, "").trim();
  return <aside className={styles.sponsor} data-amf-sponsor="" aria-label={dict.rotationAria}>
    <div className={`${dock.spCard} ${styles.sponsorCard}`}>
      <div className={dock.spViewport}>
        <AnimatePresence initial={false}>
          <motion.div key={slotNumber} className={dock.spSlide} initial={{ x: reduced ? 0 : "-100%" }} animate={{ x: 0 }} exit={{ x: reduced ? 0 : "100%" }} transition={{ duration: reduced ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}>
            {item.photoUrl ? <Image fill sizes="240px" src={fairLocalPhotoUrl(item.photoUrl)} style={fairVehiclePhotoStyle(item.photoUrl)} alt={publicLabel(item.displayName)} unoptimized className={dock.spPhoto} /> : item.brandLogoUrl ? <Image fill sizes="120px" src={item.brandLogoUrl} alt="" unoptimized className={dock.spLogo} /> : <FairBrandMark brandName={item.brandName} className={dock.spMark} />}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className={dock.spBars} aria-hidden="true">{rotation?.items.map((entry, i) => <i key={entry.eventModelId}><b style={{ transform: `scaleX(${i <= index ? 1 : 0})` }} /></i>)}</div>
      <div className={dock.spLeft}>
        <span className={`${dock.spTag} ${styles.sponsorTag}`}>{dict.rotationLabel}</span>
        <div className={dock.spName}><span>{publicLabel(item.brandName)}</span><strong>{publicLabel(item.displayName)}</strong></div>
        {!display && onShowStand ? <div className={dock.spActions}><button type="button" className={`${dock.spView} ${styles.sponsorAction}`} onClick={onShowStand}><MapPin aria-hidden="true" />{dict.showStandShort}</button></div> : null}
      </div>
    </div>
  </aside>;
}
