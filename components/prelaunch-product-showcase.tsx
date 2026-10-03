"use client";

import { ArrowDownRight } from "lucide-react";
import { useMemo, useState } from "react";
import { OfferProductPreview } from "@/components/offer-product-preview";
import { prelaunchSr as dict } from "@/lib/i18n/sr/prelaunch";
import {
  createDefaultProductSelection,
  PHYSICAL_PRODUCTS,
  type ProductId,
} from "@/lib/scanme-pricing";
import styles from "./prelaunch-landing.module.css";

export function PrelaunchProductShowcase() {
  const [activeId, setActiveId] = useState<ProductId>("compact-stand");
  const selected = useMemo(() => {
    const base = createDefaultProductSelection(activeId);
    return { ...base, design: { kind: "template" as const, templateId: "basic" as const } };
  }, [activeId]);

  return (
    <div className={styles.productShowcase}>
      <div className={styles.productRail} role="tablist" aria-label={dict.products.selectorAria}>
        {PHYSICAL_PRODUCTS.map((product, index) => {
          const active = product.id === activeId;
          return (
            <button
              key={product.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="prelaunch-product-panel"
              id={`prelaunch-product-${product.id}`}
              className={styles.productTab}
              data-active={active ? "true" : "false"}
              onClick={() => setActiveId(product.id)}
            >
              <span className={styles.productIndex}>{String(index + 1).padStart(2, "0")}</span>
              <span>{dict.products.names[product.id]}</span>
            </button>
          );
        })}
      </div>

      <div
        id="prelaunch-product-panel"
        role="tabpanel"
        aria-labelledby={`prelaunch-product-${activeId}`}
        className={styles.productPanel}
      >
        <div className={styles.productPreview} data-reveal="off">
          <span className={styles.previewLabel}>{dict.products.previewLabel}</span>
          <OfferProductPreview selected={selected} logoUrl={null} />
        </div>
        <div className={styles.productCopy}>
          <p className="accent-label text-xs font-medium">{dict.products.selectedLabel}</p>
          <h3>{dict.products.names[activeId]}</h3>
          <p className={styles.useCaseLabel}>{dict.products.useCase}</p>
          <p className={styles.productDescription}>{dict.products.descriptions[activeId]}</p>
          <p className={styles.noPrice}>{dict.products.noPrice}</p>
          <a href="#ponuda" className="button-secondary focus-signal">
            {dict.products.cta}
            <ArrowDownRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
          </a>
        </div>
      </div>
    </div>
  );
}
