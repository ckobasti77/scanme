"use client";

// Step 3 of the purchase flow (RFC-002 §2.3, TASK-36, restyled TASK-44): the
// physical-product configurator, in the SAME visual language as /ponuda. It
// reuses the offer components directly — the scene backdrop, the live
// OfferProductPreview, and the offer control choices (ConfigurationOptions) +
// the offer accordion chrome — so this reads exactly like the offer page. Only
// two things are new to the purchase flow: the "Za koju uslugu?" control is the
// FIRST accordion item (above Orientation, because the service decides which
// designs exist), and the top-right badge is a read-only ORDER SUMMARY (a door
// to the cart), not a control.
//
// Every dinar still comes from the pure modules; the physical-price matrices
// (lib/scanme-pricing.ts) are untouched. This only adds the per-line service
// binding on top of the existing per-line design choice.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ImagePlus, Minus, Palette, Plus, ShoppingBag, Trash2, Waypoints, X } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { offerSr } from "@/lib/i18n/sr/offer";
import { purchaseSr } from "@/lib/i18n/sr/purchase";
import type { BillingPeriod, ServiceId } from "@/lib/pricing/engine";
import type { PurchaseSelection } from "@/lib/offer-url";
import {
  formatRsd,
  getProduct,
  normalizeQuantity,
  PHYSICAL_PRODUCTS,
  type ProductId,
  type ProductSelection,
  type TemplateId,
} from "@/lib/scanme-pricing";
import { BasicTemplateThumbnail, OfferProductPreview } from "@/components/offer-product-preview";
import {
  AccordionLabel,
  CONTROL_ICONS,
  ConfigurationOptions,
  controlTitle,
  controlValue,
} from "@/components/offer-configurator";
import offerStyles from "@/components/offer-configurator.module.css";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import styles from "./step-products.module.css";

const dict = purchaseSr.step3;

const TEMPLATE_ASSETS: Partial<Record<TemplateId, string>> = {
  "template-1": "/offer/templates/template-1.webp",
  "template-2": "/offer/templates/template-2.webp",
  "template-3": "/offer/templates/template-3.webp",
  "template-4": "/offer/templates/template-4.webp",
  "template-5": "/offer/templates/template-5.webp",
};

// The same café/counter scenes the offer configurator uses behind the product
// (asset paths only — no offer behaviour is touched).
const SCENE_ASSETS = {
  stickers: "/offer/scenes/stickers-tabletop-v2.webp",
  windowFilm: "/offer/scenes/window-film-storefront-door-v1.webp",
  twoPiece: "/offer/scenes/two-piece-stand-cafe-table-v1.webp",
  compact: "/offer/scenes/compact-stand-cafe-counter-v2.webp",
  counter: "/offer/scenes/counter-studio.webp",
  reception: "/offer/scenes/premium-reception.webp",
} as const;

type SceneId = keyof typeof SCENE_ASSETS;

const PRODUCT_SCENES: Record<ProductId, SceneId> = {
  stickers: "stickers",
  "window-film": "windowFilm",
  "two-piece-stand": "twoPiece",
  "compact-stand": "compact",
  "premium-engraved-stand": "reception",
};

type SectionId = string;

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

function designValue(line: ProductSelection): string {
  if (line.design.kind === "custom") return offerSr.customDesign;
  return offerSr.templateNames[line.design.templateId];
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

  const [openSection, setOpenSection] = useState<SectionId>(() =>
    !single ? "binding" : (getProduct(products[0]?.productId ?? "two-piece-stand")?.controlIds[0] ?? "design"),
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

  const sceneId: SceneId = activeId ? PRODUCT_SCENES[activeId] : "counter";
  const bindingValue = bound.length
    ? bound.map((service) => purchaseSr.step1.services[service].name).join(" · ")
    : dict.bindingRequired;

  const previewKey = activeLine
    ? `${activeLine.productId}-${
        activeLine.design.kind === "template" ? activeLine.design.templateId : "custom"
      }`
    : "empty";

  return (
    <div className={styles.root}>
      <div className={styles.stage} data-scene={sceneId}>
        <AnimatePresence initial={false}>
          <motion.div
            key={sceneId}
            className={styles.sceneLayer}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          >
            <Image
              src={SCENE_ASSETS[sceneId]}
              alt=""
              fill
              sizes="(max-width: 1023px) 100vw, 1000px"
              className={styles.sceneImage}
            />
          </motion.div>
        </AnimatePresence>
        <span aria-hidden="true" className={styles.sceneTone} />

        {/* LEFT — product rail */}
        <section className={styles.rail} aria-label={dict.productsHeading}>
          <h2 className={styles.railHeading}>{dict.productsHeading}</h2>
          <ul className={styles.railList}>
            {PHYSICAL_PRODUCTS.map((product) => {
              const line = products.find((entry) => entry.productId === product.id);
              const copy = offerSr.products[product.id];
              const isActive = activeId === product.id;
              return (
                <li key={product.id}>
                  <div className={styles.railCard} data-active={isActive} data-selected={Boolean(line)}>
                    <button
                      type="button"
                      className={`focus-signal ${styles.railButton}`}
                      aria-pressed={isActive}
                      onClick={() => activate(product.id)}
                    >
                      <span className={styles.railThumb}>
                        <Image src={product.previewAsset} alt="" fill sizes="48px" className={styles.railThumbImg} />
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
                            className={`focus-signal ${styles.stepperButton}`}
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
                            className={`focus-signal ${styles.stepperButton}`}
                            aria-label={offerSr.quantityPlusOne.replace("{product}", copy.name)}
                            onClick={() => setQuantity(product.id, line.quantity + 1)}
                          >
                            <Plus size={14} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`focus-signal ${styles.addButton}`}
                          aria-label={`${dict.add}: ${copy.name}`}
                          onClick={() => addOne(product.id)}
                        >
                          <Plus size={16} aria-hidden="true" strokeWidth={2.1} />
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* CENTER — order-summary badge + live preview on the scene */}
        <section className={styles.previewZone} aria-live="polite">
          <div className={styles.previewTop}>
            <button
              type="button"
              className={`focus-signal ${styles.summaryBadge}`}
              aria-label={dict.summaryBadgeLabel}
              aria-expanded={cartOpen}
              onClick={() => setCartOpen((open) => !open)}
            >
              <ShoppingBag size={14} aria-hidden="true" />
              <span className={styles.summaryText}>{badgeText}</span>
            </button>
            {cartOpen ? (
              <div className={`${styles.cart} offer-glass`} role="dialog" aria-label={dict.cartTitle}>
                <div className={styles.cartHead}>
                  <span className={styles.cartTitle}>{dict.cartTitle}</span>
                  <button
                    type="button"
                    className={`focus-signal ${styles.cartClose}`}
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
            <AnimatePresence mode="wait" initial={false}>
              {activeLine ? (
                <motion.div
                  key={previewKey}
                  className={styles.previewMotion}
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduce ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.2 }}
                >
                  <OfferProductPreview selected={activeLine} logoUrl={null} />
                </motion.div>
              ) : (
                <p className={styles.previewEmpty}>{dict.empty}</p>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* RIGHT — the offer accordion, binding FIRST */}
        <aside className={`${styles.sidebar} offer-glass offer-glass--panel`}>
          {activeLine && activeCatalog ? (
            <Accordion
              type="single"
              value={openSection}
              onValueChange={(value) => setOpenSection(value)}
              collapsible
              className={styles.accordion}
            >
              {!single ? (
                <AccordionItem value="binding" className={`${offerStyles.controlItem} ${styles.bindingItem}`}>
                  <AccordionTrigger className={offerStyles.controlTrigger}>
                    <AccordionLabel icon={Waypoints} title={dict.bindingHeading} value={bindingValue} />
                  </AccordionTrigger>
                  <AccordionContent className={offerStyles.controlShelf}>
                    <p className={styles.bindingHint}>{dict.bindingHint}</p>
                    <div className={styles.bindingChoices} role="group" aria-label={dict.bindingHeading}>
                      {purchased.map((service) => {
                        const on = bound.includes(service);
                        return (
                          <button
                            key={service}
                            type="button"
                            className={`focus-signal ${styles.bindingChoice}`}
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
                  </AccordionContent>
                </AccordionItem>
              ) : null}

              {activeCatalog.controlIds.map((controlId) => (
                <AccordionItem key={controlId} value={controlId} className={offerStyles.controlItem}>
                  <AccordionTrigger className={offerStyles.controlTrigger}>
                    <AccordionLabel
                      icon={CONTROL_ICONS[controlId]}
                      title={controlTitle(controlId)}
                      value={controlValue(activeLine, controlId)}
                    />
                  </AccordionTrigger>
                  <AccordionContent className={offerStyles.controlShelf}>
                    <ConfigurationOptions
                      controlId={controlId}
                      selected={activeLine}
                      product={activeCatalog}
                      onChange={patchActive}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}

              <AccordionItem value="design" className={offerStyles.controlItem}>
                <AccordionTrigger className={offerStyles.controlTrigger}>
                  <AccordionLabel icon={Palette} title={dict.designHeading} value={designValue(activeLine)} />
                </AccordionTrigger>
                <AccordionContent className={offerStyles.controlShelf}>
                  <div className={styles.templateGrid}>
                    {templates.map((templateId) => {
                      const active =
                        activeLine.design.kind === "template" &&
                        activeLine.design.templateId === templateId;
                      return (
                        <button
                          key={templateId}
                          type="button"
                          className={`focus-signal ${styles.templateOption}`}
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
                          <span className={styles.templateName}>{offerSr.templateNames[templateId]}</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      className={`focus-signal ${styles.customOption}`}
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
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <p className={styles.controlsEmpty}>{dict.empty}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
