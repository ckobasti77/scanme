"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import {
  CalendarCheck,
  Images,
  MessageSquareText,
  PanelsTopLeft,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import styles from "./ecosystem-product-deck.module.css";

type PlannedProduct = {
  title: string;
  icon: LucideIcon;
  rotation: string;
};

const plannedProducts: PlannedProduct[] = [
  {
    title: "ScanMe Page",
    icon: PanelsTopLeft,
    rotation: "-1.1deg",
  },
  {
    title: "ScanMe Venue",
    icon: CalendarCheck,
    rotation: "0.65deg",
  },
  {
    title: "ScanMe Memories",
    icon: Images,
    rotation: "1.55deg",
  },
  {
    title: "ScanMe Loyalty",
    icon: Stamp,
    rotation: "2.4deg",
  },
];

export function EcosystemProductDeck() {
  const [activeProduct, setActiveProduct] = useState(0);

  return (
    <div data-reveal-item className={styles.showcase}>
      <article className={styles.reviewCard}>
        <div className={styles.cardTopline}>
          <span className={styles.availableStatus}>Dostupno sada</span>
          <span className={styles.reviewIcon} aria-hidden="true">
            <MessageSquareText strokeWidth={1.55} />
          </span>
        </div>

        <div className={styles.reviewContent}>
          <p className={styles.productKind}>Aktivni ScanMe proizvod</p>
          <h3>ScanMe Review</h3>
          <p>
            Dinamički QR za Google recenzije, sa štampom, isporukom i pregledom prometa linka.
          </p>
        </div>
      </article>

      <div className={styles.deckWrap} onMouseLeave={() => setActiveProduct(0)}>
        <p id="planned-products-description" className="sr-only">
          Četiri ravnopravna ScanMe proizvoda koja su trenutno u planu.
        </p>

        <div className={styles.deck} aria-describedby="planned-products-description">
          {plannedProducts.map((product, index) => {
            const Icon = product.icon;
            const active = activeProduct === index;
            const position =
              index < activeProduct ? "before" : index > activeProduct ? "after" : "active";
            const cardStyle = {
              "--deck-index": index,
              "--deck-rotation": product.rotation,
              zIndex: active
                ? 50
                : position === "before"
                  ? 20 + index
                  : 20 + plannedProducts.length - index,
            } as CSSProperties;

            return (
              <article
                key={product.title}
                className={styles.futureCard}
                data-active={active}
                data-position={position}
                style={cardStyle}
                onMouseEnter={() => setActiveProduct(index)}
              >
                <button
                  type="button"
                  className={styles.cardButton}
                  aria-pressed={active}
                  aria-label={`Istakni ${product.title}`}
                  onClick={() => setActiveProduct(index)}
                  onFocus={() => setActiveProduct(index)}
                />

                <div className={styles.futureCardContent}>
                  <div className={styles.cardTopline}>
                    <span className={styles.futureIcon} aria-hidden="true">
                      <Icon strokeWidth={1.5} />
                    </span>
                    <span className={styles.plannedStatus}>
                      <span aria-hidden="true" />
                      U planu
                    </span>
                  </div>

                  <div className={styles.futureCopy}>
                    <h3>{product.title}</h3>
                  </div>

                  <span className={styles.edgeTitle} aria-hidden="true">
                    {product.title}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
