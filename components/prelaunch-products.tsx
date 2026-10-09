"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { OfferProductPreview, ScanMeStandArtwork } from "@/components/offer-product-preview";
import { PRODUCT_SCENES, SCENE_ASSETS, type SceneId } from "@/components/offer-scenes";
import { offerSr } from "@/lib/i18n/sr/offer";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import {
  createDefaultProductSelection,
  getProduct,
  type ProductId,
  type ProductSelection,
} from "@/lib/scanme-pricing";
import styles from "./prelaunch-products.module.css";

// #proizvodi — the /ponuda configurator as a promo view: the product strip,
// the scene and the product on it, its name and "Najbolje za". No prices,
// quantities or settings; one CTA leads to the contact form. Only the compact
// stand carries a design (ScanMeStandArtwork); the others show a clean
// surface until their designs are approved.

type ShowcaseId = Exclude<ProductId, "premium-engraved-stand">;

const ORDER: readonly ShowcaseId[] = ["compact-stand", "two-piece-stand", "stickers", "window-film"];

const SELECTIONS: Record<ShowcaseId, ProductSelection> = {
  "compact-stand": { ...createDefaultProductSelection("compact-stand"), background: "black" },
  "two-piece-stand": createDefaultProductSelection("two-piece-stand"),
  stickers: createDefaultProductSelection("stickers"),
  // A white film: a clear one without print would not be visible on the glass.
  "window-film": { ...createDefaultProductSelection("window-film"), background: "white" },
};

const SCENES = [...new Set(ORDER.map((id) => PRODUCT_SCENES[id]))] as SceneId[];
const EASE = [0.22, 1, 0.36, 1] as const;

function ProductCopy({ id, heading = false }: { id: ShowcaseId; heading?: boolean }) {
  const copy = offerSr.products[id];
  const Title = heading ? "h3" : "p";
  return (
    <>
      <Title className={styles.title}>{copy.name}</Title>
      <p className={styles.subtitle}>{copy.subtitle}</p>
      <p className={styles.useCase}>
        <strong>{offerSr.useCase}: </strong>
        {copy.useCase}
      </p>
    </>
  );
}

export function PrelaunchProducts() {
  const [activeId, setActiveId] = useState<ShowcaseId>("compact-stand");
  const reduceMotion = useReducedMotion();
  const sceneId = PRODUCT_SCENES[activeId];

  const choose = (id: ShowcaseId, button: HTMLButtonElement) => {
    setActiveId(id);
    button.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <div className={styles.stage} data-scene={sceneId}>
      {/* Every scene stays loaded; the active one fades in over the previous with a slow settle. */}
      <div className={styles.backdrop} aria-hidden="true">
        {SCENES.map((scene) => (
          <div key={scene} className={styles.scene} data-scene={scene} data-active={scene === sceneId ? "true" : "false"}>
            <Image src={SCENE_ASSETS[scene]} alt="" fill sizes="(max-width: 1023px) 100vw, 1216px" className={styles.sceneImage} />
          </div>
        ))}
        <div className={styles.tone} />
      </div>

      <div className={styles.rail}>
        <motion.div layoutScroll className={styles.list} role="group" aria-label={dict.products.selectorAria}>
          {ORDER.map((id) => {
            const active = id === activeId;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                data-active={active ? "true" : "false"}
                className={`focus-signal ${styles.product}`}
                onClick={(event) => choose(id, event.currentTarget)}
              >
                {active ? (
                  <motion.span
                    layoutId="prelaunch-product-indicator"
                    className={styles.indicator}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34, mass: 0.9 }}
                  />
                ) : null}
                <span className={styles.thumb}>
                  <Image src={getProduct(id)!.previewAsset} alt="" fill sizes="64px" className={styles.thumbImage} />
                </span>
                <span className={styles.name}>{offerSr.products[id].name}</span>
              </button>
            );
          })}
        </motion.div>
        <p className={styles.origin}>{offerSr.domesticProduction}</p>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeId}
          className={styles.objectLayer}
          data-product={activeId}
          initial={reduceMotion ? false : { opacity: 0, y: 26, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.16, ease: "easeIn" } }}
          transition={reduceMotion ? { duration: 0 } : { y: { type: "spring", stiffness: 170, damping: 22 }, opacity: { duration: 0.38, ease: EASE }, filter: { duration: 0.5, ease: EASE } }}
        >
          <OfferProductPreview
            selected={SELECTIONS[activeId]}
            logoUrl={null}
            artwork={activeId === "compact-stand" ? <ScanMeStandArtwork /> : null}
            className={styles.object}
          />
        </motion.div>
      </AnimatePresence>

      <div className={styles.copy}>
        {/* Every product's copy sits in one cell (hidden): the block keeps the height of the longest, so nothing below jumps. */}
        <div className={styles.copyStack} aria-live="polite">
          {ORDER.map((id) => (
            <div key={id} className={styles.copySizer} aria-hidden="true">
              <ProductCopy id={id} />
            </div>
          ))}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeId}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: 0.14 } }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE }}
            >
              <ProductCopy id={activeId} heading />
            </motion.div>
          </AnimatePresence>
        </div>
        <a href="#kontakt" className={`button-primary focus-signal ${styles.cta}`}>
          {dict.products.cta}
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
        </a>
      </div>
    </div>
  );
}
