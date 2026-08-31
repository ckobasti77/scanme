"use client";

// Step 3 of the purchase flow (RFC-002 §2.3, TASK-36): the physical-product
// configurator, laid inside the SAME shell (TASK-33) — three regions in the
// shell's grid, one pass, never N passes.
//
//   LEFT   the product rail: add a type, set its tiraž.
//   CENTER a live preview of the active line + the read-only ORDER-SUMMARY
//          badge that used to be an editable chip and is now just a door to
//          the cart (RFC-002 §2.3: "the top badge stops being a control").
//   RIGHT  the controls for the active line. The FIRST item, above Orientation,
//          is "Za koju uslugu?" — because the service decides which designs are
//          even available, it must come before design. It is set apart, marked
//          required, and hidden entirely when only one service was bought (then
//          the line is bound to it silently).
//
// Every dinar still comes from the pure modules: the split-total bar (the shell)
// reads computeProductsOneTime; nothing here does money arithmetic, and the
// physical-price matrices (lib/scanme-pricing.ts) are untouched — this only adds
// the per-line service binding on top of the existing per-line design choice.

import { motion, useReducedMotion } from "framer-motion";
import { Check, ImagePlus, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { offerSr } from "@/lib/i18n/sr/offer";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { BillingPeriod, ServiceId } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import {
  compactBackgroundsForMaterial,
  formatRsd,
  getProduct,
  normalizeQuantity,
  PHYSICAL_PRODUCTS,
  type ProductBackground,
  type ProductControlId,
  type ProductId,
  type ProductSelection,
  type TemplateId,
} from "@/lib/scanme-pricing";
import { BasicTemplateThumbnail, OfferProductPreview } from "@/components/offer-product-preview";
import { commonPeriod } from "./step-services-model";
import {
  availableTemplates,
  boundServicesOf,
  isSingleService,
  leadsToSplitter,
  newProductLine,
  purchasedServiceOrder,
  toggleBoundService,
} from "./step-products-model";
import shellStyles from "./purchase-shell.module.css";
import styles from "./step-products.module.css";

const dict = purchaseSr.step3;

const TEMPLATE_ASSETS: Partial<Record<TemplateId, string>> = {
  "template-1": "/offer/templates/template-1.webp",
  "template-2": "/offer/templates/template-2.webp",
  "template-3": "/offer/templates/template-3.webp",
  "template-4": "/offer/templates/template-4.webp",
  "template-5": "/offer/templates/template-5.webp",
};

interface StepProductsProps {
  selection: PurchaseSelection;
  onChange: (next: PurchaseSelection) => void;
}

function periodLabel(period: BillingPeriod): string {
  return period === "monthly" ? purchaseSr.perMonth : purchaseSr.perYear;
}

function serviceCountText(count: number): string {
  const category = srPluralCategory(count);
  const template =
    category === "one"
      ? dict.serviceCountOne
      : category === "few"
        ? dict.serviceCountFew
        : dict.serviceCountMany;
  return fmt(template, { count });
}

function planLabel(selection: PurchaseSelection): string {
  if (selection.plan === "premium") return purchaseSr.planPremium;
  if (selection.plan === "enterprise") return purchaseSr.planEnterprise;
  return purchaseSr.planBasic;
}

/** The period the order-summary badge shows: Premium's own billing period, else
 *  the services' shared period when uniform (null when mixed → the badge omits
 *  the period segment rather than lie about one). */
function summaryPeriod(selection: PurchaseSelection): BillingPeriod | null {
  if (selection.plan === "premium") return selection.planPeriod ?? null;
  return commonPeriod(selection);
}

// --- One control's choice row -----------------------------------------------

function labelForControl(controlId: ProductControlId): string {
  if (controlId === "orientation") return offerSr.orientationHeading;
  if (controlId === "shape") return offerSr.shapeHeading;
  if (controlId === "background") return offerSr.backgroundHeading;
  if (controlId === "finish") return offerSr.finishHeading;
  if (controlId === "material") return offerSr.materialHeading;
  if (controlId === "woodType") return offerSr.woodTypeHeading;
  return offerSr.dimensionsHeading;
}

function ControlRow({
  controlId,
  line,
  onPatch,
}: {
  controlId: ProductControlId;
  line: ProductSelection;
  onPatch: (patch: Partial<ProductSelection>) => void;
}) {
  const product = getProduct(line.productId);
  if (!product) return null;

  let options: { value: string; label: string; onSelect: () => void; active: boolean }[] = [];

  if (controlId === "orientation") {
    options = (product.allowedOrientations ?? []).map((orientation) => ({
      value: orientation,
      label: orientation === "portrait" ? offerSr.portrait : offerSr.landscape,
      active: line.orientation === orientation,
      onSelect: () => onPatch({ orientation }),
    }));
  } else if (controlId === "shape") {
    options = (product.allowedShapes ?? []).map((shape) => ({
      value: shape,
      label: offerSr.shapeNames[shape],
      active: line.shape === shape,
      onSelect: () => onPatch({ shape }),
    }));
  } else if (controlId === "background") {
    const backgrounds =
      product.id === "compact-stand"
        ? compactBackgroundsForMaterial(line.material)
        : (product.allowedBackgrounds ?? []);
    options = backgrounds.map((background) => ({
      value: background,
      label: offerSr.backgroundNames[background],
      active: line.background === background,
      onSelect: () => onPatch({ background }),
    }));
  } else if (controlId === "finish") {
    options = (product.allowedFinishes ?? []).map((finish) => ({
      value: finish,
      label: offerSr.finishNames[finish],
      active: line.finish === finish,
      onSelect: () => onPatch({ finish }),
    }));
  } else if (controlId === "material") {
    options = (product.allowedMaterials ?? []).map((material) => ({
      value: material,
      label: offerSr.materialNames[material],
      active: line.material === material,
      onSelect: () => {
        const backgrounds = compactBackgroundsForMaterial(material);
        const current = line.background ?? backgrounds[0];
        const background: ProductBackground = backgrounds.includes(current)
          ? current
          : backgrounds[0];
        onPatch({ material, background });
      },
    }));
  } else if (controlId === "woodType") {
    options = (product.allowedWoodTypes ?? []).map((woodType) => ({
      value: woodType,
      label: offerSr.woodTypeNames[woodType],
      active: line.woodType === woodType,
      onSelect: () => onPatch({ woodType }),
    }));
  } else {
    options = product.allowedDimensions.map((dimension) => ({
      value: dimension,
      label: offerSr.dimensionNames[dimension],
      active: line.dimension === dimension,
      onSelect: () => onPatch({ dimension }),
    }));
  }

  return (
    <div className={styles.controlGroup}>
      <p className={styles.controlLabel}>{labelForControl(controlId)}</p>
      <div className={styles.choiceRow} role="group" aria-label={labelForControl(controlId)}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.choice}
            data-active={option.active}
            aria-pressed={option.active}
            onClick={option.onSelect}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepProducts({ selection, onChange }: StepProductsProps) {
  const reduce = useReducedMotion() ?? false;
  const products = selection.products;

  const [activeProductId, setActiveProductId] = useState<ProductId | null>(
    () => products[0]?.productId ?? null,
  );
  const [cartOpen, setCartOpen] = useState(false);
  // The template a line was just reset TO, when a rebind dropped an incompatible
  // design — surfaced as the one-line reason and cleared on the next design edit.
  const [resetTo, setResetTo] = useState<Partial<Record<ProductId, TemplateId>>>({});

  const purchased = purchasedServiceOrder(selection);
  const single = isSingleService(selection);

  // The active line is whichever product is being configured, falling back to
  // the first line in the cart (an id can go stale when its line is removed).
  const activeLine =
    products.find((line) => line.productId === activeProductId) ?? products[0] ?? null;
  const activeId = activeLine?.productId ?? null;
  const activeCatalog = activeId ? getProduct(activeId) : undefined;
  const bound = useMemo(
    () => (activeId ? boundServicesOf(selection, activeId) : []),
    [selection, activeId],
  );
  const templates = useMemo(
    () => (activeId ? availableTemplates(activeId, bound) : []),
    [activeId, bound],
  );

  function activate(productId: ProductId) {
    setActiveProductId(productId);
  }

  function setQuantity(productId: ProductId, quantity: number) {
    const next = Math.max(0, Math.floor(quantity));
    const existing = products.find((line) => line.productId === productId);
    if (next === 0) {
      onChange({ ...selection, products: products.filter((line) => line.productId !== productId) });
      return;
    }
    if (existing) {
      onChange({
        ...selection,
        products: products.map((line) =>
          line.productId === productId ? { ...line, quantity: normalizeQuantity(next) } : line,
        ),
      });
      return;
    }
    // A brand-new line is born with a design valid for its (silent) binding.
    const line = { ...newProductLine(selection, productId), quantity: normalizeQuantity(next) };
    onChange({ ...selection, products: [...products, line] });
    activate(productId);
  }

  function addOne(productId: ProductId) {
    const existing = products.find((line) => line.productId === productId);
    setQuantity(productId, (existing?.quantity ?? 0) + 1);
    activate(productId);
  }

  function patchActive(patch: Partial<ProductSelection>) {
    if (!activeId) return;
    onChange({
      ...selection,
      products: products.map((line) =>
        line.productId === activeId ? { ...line, ...patch } : line,
      ),
    });
  }

  function pickTemplate(templateId: TemplateId) {
    if (!activeId) return;
    setResetTo((current) => ({ ...current, [activeId]: undefined }));
    patchActive({ design: { kind: "template", templateId } });
  }

  function pickCustom() {
    if (!activeId) return;
    setResetTo((current) => ({ ...current, [activeId]: undefined }));
    const brief = activeLine?.design.kind === "custom" ? activeLine.design.brief : "";
    patchActive({ design: { kind: "custom", brief } });
  }

  function toggleService(service: ServiceId) {
    if (!activeId) return;
    const result = toggleBoundService(selection, activeId, service);
    onChange(result.selection);
    setResetTo((current) => ({
      ...current,
      [activeId]: result.reset ? result.reset.to : undefined,
    }));
  }

  const period = summaryPeriod(selection);
  const badgeText =
    `${serviceCountText(purchased.length)} · ${planLabel(selection)}` +
    (period ? ` · ${periodLabel(period)}` : "");

  return (
    <>
      {/* LEFT — the product rail */}
      <div className={`${shellStyles.panel} ${styles.panel} ${styles.rail}`} data-slot="left">
        <h2 className={styles.railHeading}>{dict.productsHeading}</h2>
        <p className={styles.railHint}>{dict.productsHint}</p>
        <ul className={styles.railList}>
          {PHYSICAL_PRODUCTS.map((product) => {
            const line = products.find((entry) => entry.productId === product.id);
            const copy = offerSr.products[product.id];
            const isActive = activeId === product.id;
            return (
              <li key={product.id}>
                <div
                  className={styles.railCard}
                  data-active={isActive}
                  data-selected={Boolean(line)}
                >
                  <button
                    type="button"
                    className={styles.railButton}
                    aria-pressed={isActive}
                    onClick={() => activate(product.id)}
                  >
                    <span className={styles.railThumb}>
                      <Image src={product.previewAsset} alt="" fill sizes="52px" />
                    </span>
                    <span className={styles.railCopy}>
                      <span className={styles.railName}>{copy.name}</span>
                      <span className={styles.railPrice}>
                        {fmt(offerSr.priceFrom, { price: formatRsd(product.baseUnitPrice) })}
                      </span>
                    </span>
                  </button>
                  <div className={styles.railActions}>
                    {line ? (
                      <div className={styles.stepper}>
                        <button
                          type="button"
                          className={styles.stepperButton}
                          aria-label={offerSr.quantityMinusOne.replace("{product}", copy.name)}
                          onClick={() => setQuantity(product.id, line.quantity - 1)}
                        >
                          {line.quantity <= 1 ? (
                            <Trash2 size={14} aria-hidden="true" />
                          ) : (
                            <Minus size={14} aria-hidden="true" />
                          )}
                        </button>
                        <span className={styles.stepperCount} aria-live="polite">
                          {line.quantity}
                        </span>
                        <button
                          type="button"
                          className={styles.stepperButton}
                          aria-label={offerSr.quantityPlusOne.replace("{product}", copy.name)}
                          onClick={() => setQuantity(product.id, line.quantity + 1)}
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.addButton}
                        onClick={() => addOne(product.id)}
                      >
                        <Plus size={14} aria-hidden="true" />
                        {dict.add}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* CENTER — preview + read-only order-summary badge */}
      <div className={`${shellStyles.panel} ${styles.panel} ${styles.center}`} data-slot="center">
        <div className={styles.centerTop}>
          <button
            type="button"
            className={styles.summaryBadge}
            aria-label={dict.summaryBadgeLabel}
            aria-expanded={cartOpen}
            onClick={() => setCartOpen((open) => !open)}
          >
            <ShoppingBag size={15} aria-hidden="true" />
            <span className={styles.summaryText}>{badgeText}</span>
          </button>

          {cartOpen ? (
            <div className={styles.cart} role="dialog" aria-label={dict.cartTitle}>
              <div className={styles.cartHead}>
                <span className={styles.cartTitle}>{dict.cartTitle}</span>
                <button
                  type="button"
                  className={styles.cartClose}
                  aria-label={dict.cartClose}
                  onClick={() => setCartOpen(false)}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
              <div className={styles.cartBody}>
                <p className={styles.cartHeading}>{dict.cartServicesHeading}</p>
                <ul className={styles.cartList}>
                  {purchased.map((service) => {
                    const svcPeriod = selection.services.find((e) => e.service === service)?.period;
                    return (
                      <li key={service} className={styles.cartRow}>
                        <span>{purchaseSr.step1.services[service].name}</span>
                        {svcPeriod ? <span>{periodLabel(svcPeriod)}</span> : null}
                      </li>
                    );
                  })}
                </ul>
                <p className={styles.cartHeading}>{dict.cartPlanHeading}</p>
                <p className={styles.cartPlan}>{planLabel(selection)}</p>
                <p className={styles.cartHeading}>{dict.cartProductsHeading}</p>
                {products.length > 0 ? (
                  <ul className={styles.cartList}>
                    {products.map((line) => (
                      <li key={line.productId} className={styles.cartRow}>
                        <span>{offerSr.products[line.productId].name}</span>
                        <span>× {line.quantity}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.cartEmpty}>{dict.cartProductsEmpty}</p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.previewStage}>
          {activeLine ? (
            <motion.div
              key={`${activeLine.productId}-${
                activeLine.design.kind === "template" ? activeLine.design.templateId : "custom"
              }`}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
              className={styles.previewInner}
            >
              <OfferProductPreview selected={activeLine} logoUrl={null} />
            </motion.div>
          ) : (
            <p className={styles.previewEmpty}>{dict.empty}</p>
          )}
        </div>
      </div>

      {/* RIGHT — controls for the active line, binding FIRST */}
      <div className={`${shellStyles.panel} ${styles.panel} ${styles.controls}`} data-slot="right">
        {activeLine && activeCatalog ? (
          <>
            {/* Binding — the FIRST item, above Orientation. Hidden when only one
                service was bought (the line is then bound to it silently). */}
            {!single ? (
              <section className={styles.binding} aria-labelledby="binding-heading">
                <div className={styles.bindingHead}>
                  <p id="binding-heading" className={styles.bindingHeading}>
                    {dict.bindingHeading}
                  </p>
                  <span className={styles.bindingRequired}>{dict.bindingRequired}</span>
                </div>
                <p className={styles.bindingHint}>{dict.bindingHint}</p>
                <div className={styles.bindingChoices} role="group" aria-labelledby="binding-heading">
                  {purchased.map((service) => {
                    const on = bound.includes(service);
                    return (
                      <button
                        key={service}
                        type="button"
                        className={styles.bindingChoice}
                        data-active={on}
                        aria-pressed={on}
                        onClick={() => toggleService(service)}
                      >
                        {on ? <Check size={13} aria-hidden="true" /> : null}
                        {purchaseSr.step1.services[service].name}
                      </button>
                    );
                  })}
                </div>
                {leadsToSplitter(bound) ? (
                  <p className={styles.splitterNote}>{dict.splitterNote}</p>
                ) : null}
                {activeId && resetTo[activeId] ? (
                  <p className={styles.resetNote} role="status">
                    {fmt(dict.designResetNote, {
                      template: offerSr.templateNames[resetTo[activeId]!],
                    })}
                  </p>
                ) : null}
              </section>
            ) : null}

            {activeCatalog.controlIds.map((controlId) => (
              <ControlRow
                key={controlId}
                controlId={controlId}
                line={activeLine}
                onPatch={patchActive}
              />
            ))}

            {/* Design — the templates the bound service offers, plus custom. */}
            <div className={styles.controlGroup}>
              <p className={styles.controlLabel}>{dict.designHeading}</p>
              <div className={styles.templateGrid}>
                {templates.map((templateId) => {
                  const active =
                    activeLine.design.kind === "template" &&
                    activeLine.design.templateId === templateId;
                  return (
                    <button
                      key={templateId}
                      type="button"
                      className={styles.templateOption}
                      data-active={active}
                      aria-pressed={active}
                      onClick={() => pickTemplate(templateId)}
                    >
                      <span className={styles.templateThumb}>
                        {templateId === "basic" ? (
                          <BasicTemplateThumbnail />
                        ) : (
                          <Image
                            src={TEMPLATE_ASSETS[templateId]!}
                            alt=""
                            fill
                            sizes="120px"
                            className="object-cover object-top"
                          />
                        )}
                        {active ? (
                          <span className={styles.templateCheck}>
                            <Check size={12} aria-hidden="true" />
                          </span>
                        ) : null}
                      </span>
                      <span className={styles.templateName}>
                        {offerSr.templateNames[templateId]}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={styles.customOption}
                  data-active={activeLine.design.kind === "custom"}
                  aria-pressed={activeLine.design.kind === "custom"}
                  onClick={pickCustom}
                >
                  <ImagePlus size={16} aria-hidden="true" />
                  <span>{offerSr.customDesign}</span>
                  <span className={styles.customPrice}>{offerSr.customPrice}</span>
                </button>
              </div>
              {activeLine.design.kind === "custom" ? (
                <label className={styles.customBrief}>
                  <span className={styles.customBriefLabel}>{offerSr.customBriefLabel}</span>
                  <textarea
                    className={styles.customBriefInput}
                    value={activeLine.design.brief}
                    maxLength={500}
                    rows={3}
                    placeholder={offerSr.customBody}
                    onChange={(event) =>
                      patchActive({ design: { kind: "custom", brief: event.target.value } })
                    }
                  />
                </label>
              ) : null}
            </div>
          </>
        ) : (
          <p className={styles.controlsEmpty}>{dict.empty}</p>
        )}
      </div>
    </>
  );
}
