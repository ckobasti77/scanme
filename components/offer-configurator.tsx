"use client";

import { useMutation, useQuery } from "convex/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Layers3,
  LoaderCircle,
  MonitorUp,
  Palette,
  PanelTop,
  Plus,
  RotateCw,
  Ruler,
  Shapes,
  Sparkles,
  Trash2,
  Trees,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./offer-configurator.module.css";
import {
  BasicTemplateThumbnail,
  OfferProductPreview,
} from "./offer-product-preview";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fmt } from "@/lib/i18n/format";
import { offerSr as dict } from "@/lib/i18n/sr/offer";
import { getOrCreateOfferLogoSession } from "@/lib/offer-logo-session";
import { encodeSelection } from "@/lib/offer-url";
import {
  compactBackgroundsForMaterial,
  computeOrderBreakdown,
  createDefaultProductSelection,
  formatRsd,
  getProduct,
  PHYSICAL_PRODUCTS,
  type BillingPeriod,
  type OrderSelection,
  type PhysicalProduct,
  type ProductControlId,
  type ProductId,
  type ProductSelection,
  type PublicTierId,
  type ServiceId,
  type TemplateId,
} from "@/lib/scanme-pricing";

const TEMPLATE_ASSETS: Partial<Record<TemplateId, string>> = {
  "template-1": "/offer/templates/template-1.webp",
  "template-2": "/offer/templates/template-2.webp",
  "template-3": "/offer/templates/template-3.webp",
  "template-4": "/offer/templates/template-4.webp",
  "template-5": "/offer/templates/template-5.webp",
};

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const SERVICES: readonly ServiceId[] = ["review", "links"];
const TIERS: readonly PublicTierId[] = ["starter", "premium"];
const PERIODS: readonly BillingPeriod[] = ["monthly", "annual"];
type ControlSectionId = ProductControlId | "design" | "logo";
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

function copySelection(selection: OrderSelection): OrderSelection {
  return {
    ...selection,
    products: selection.products.map((product) => ({
      ...product,
      design:
        selection.service === "links" &&
        product.design.kind === "template" &&
        product.design.templateId === "basic"
          ? { kind: "template", templateId: "template-1" }
          : { ...product.design },
    })),
  };
}

type ProductDrafts = Record<ProductId, ProductSelection>;

function copyProductSelection(product: ProductSelection): ProductSelection {
  return { ...product, design: { ...product.design } };
}

function buildProductDrafts(selection: OrderSelection): ProductDrafts {
  return Object.fromEntries(
    PHYSICAL_PRODUCTS.map((product) => {
      const selected = selection.products.find((item) => item.productId === product.id);
      return [
        product.id,
        selected
          ? copyProductSelection(selected)
          : createDefaultProductSelection(product.id),
      ];
    }),
  ) as ProductDrafts;
}

function quantityFromDraftInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  return Math.max(0, Math.floor(Number.parseInt(digits, 10)));
}

function ChoiceButton({
  active,
  children,
  onClick,
  tooltip,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <span className={styles.choiceButtonWrap}>
      <button
        type="button"
        aria-pressed={active}
        data-active={active ? "true" : "false"}
        onClick={onClick}
        title={tooltip}
        className={`focus-signal ${styles.choiceButton}`}
      >
        {children}
      </button>
      {tooltip ? <span className={styles.choiceTooltip}>{tooltip}</span> : null}
    </span>
  );
}

export function AccordionLabel({
  icon: Icon,
  title,
  value,
}: {
  icon: typeof RotateCw;
  title: string;
  value: string;
}) {
  return (
    <span className={styles.controlLabel}>
      <span className={styles.controlLens}>
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.6} />
      </span>
      <span className={styles.controlCopy}>
        <span className={styles.controlTitle}>{title}</span>
        <span className={styles.controlValue}>{value}</span>
      </span>
    </span>
  );
}

export const CONTROL_ICONS: Record<ProductControlId, typeof RotateCw> = {
  orientation: RotateCw,
  shape: Shapes,
  background: PanelTop,
  finish: Sparkles,
  material: Box,
  woodType: Trees,
  dimension: Ruler,
};

export function controlTitle(controlId: ProductControlId): string {
  if (controlId === "orientation") return dict.orientationHeading;
  if (controlId === "shape") return dict.shapeHeading;
  if (controlId === "background") return dict.backgroundHeading;
  if (controlId === "finish") return dict.finishHeading;
  if (controlId === "material") return dict.materialHeading;
  if (controlId === "woodType") return dict.woodTypeHeading;
  return dict.dimensionsHeading;
}

export function controlValue(selected: ProductSelection, controlId: ProductControlId): string {
  if (controlId === "orientation") {
    return selected.orientation === "landscape" ? dict.landscape : dict.portrait;
  }
  if (controlId === "shape") {
    return selected.shape ? dict.shapeNames[selected.shape] : "";
  }
  if (controlId === "background") {
    return selected.background ? dict.backgroundNames[selected.background] : "";
  }
  if (controlId === "finish") {
    return selected.finish ? dict.finishNames[selected.finish] : "";
  }
  if (controlId === "material") {
    return selected.material ? dict.materialNames[selected.material] : "";
  }
  if (controlId === "woodType") {
    return selected.woodType ? dict.woodTypeNames[selected.woodType] : "";
  }
  return dict.dimensionNames[selected.dimension];
}

function exactDimension(selected: ProductSelection): string | null {
  if (selected.productId === "stickers") {
    const dimensions = {
      rectangle: { small: "9 × 5 cm", medium: "12 × 8 cm", large: "15 × 10 cm" },
      square: { small: "7 × 7 cm", medium: "9 × 9 cm", large: "13 × 13 cm" },
      circle: { small: "Ø 7 cm", medium: "Ø 9 cm", large: "Ø 13 cm" },
    } as const;
    if (
      selected.shape &&
      (selected.dimension === "small" ||
        selected.dimension === "medium" ||
        selected.dimension === "large")
    ) {
      return dimensions[selected.shape][selected.dimension];
    }
  }
  if (selected.productId === "window-film") {
    const dimensions = {
      small: "9 × 5 cm",
      medium: "12 × 12 cm",
      large: "20 × 20 cm",
    } as const;
    if (
      selected.dimension === "small" ||
      selected.dimension === "medium" ||
      selected.dimension === "large"
    ) {
      return dimensions[selected.dimension];
    }
  }
  if (
    selected.productId === "two-piece-stand" ||
    selected.productId === "compact-stand"
  ) {
    const dimensions = {
      a6: "10,5 × 14,8 cm",
      a5: "14,8 × 21 cm",
      a4: "21 × 29,7 cm",
    } as const;
    if (
      selected.dimension === "a6" ||
      selected.dimension === "a5" ||
      selected.dimension === "a4"
    ) {
      return dimensions[selected.dimension];
    }
  }
  return null;
}

export function ConfigurationOptions({
  controlId,
  selected,
  product,
  onChange,
}: {
  controlId: ProductControlId;
  selected: ProductSelection;
  product: PhysicalProduct;
  onChange: (patch: Partial<ProductSelection>) => void;
}) {
  if (controlId === "orientation") {
    return (
      <div className={styles.choiceGridTwo}>
        {product.allowedOrientations?.map((orientation) => (
          <ChoiceButton
            key={orientation}
            active={selected.orientation === orientation}
            onClick={() => onChange({ orientation })}
          >
            <span className={styles.orientationChoice}>
              <span
                aria-hidden="true"
                data-orientation={orientation}
                className={styles.orientationShape}
              />
              {orientation === "portrait" ? dict.portrait : dict.landscape}
            </span>
          </ChoiceButton>
        ))}
      </div>
    );
  }

  if (controlId === "shape") {
    return (
      <div className={styles.choiceGridShape}>
        {product.allowedShapes?.map((shape) => (
          <ChoiceButton
            key={shape}
            active={selected.shape === shape}
            onClick={() => onChange({ shape })}
          >
            <span className={styles.visualChoice}>
              <span aria-hidden="true" data-shape={shape} className={styles.shapeMarker} />
              <span>{dict.shapeNames[shape]}</span>
            </span>
          </ChoiceButton>
        ))}
      </div>
    );
  }

  if (controlId === "background") {
    const backgrounds =
      product.id === "compact-stand"
        ? compactBackgroundsForMaterial(selected.material)
        : product.allowedBackgrounds;
    return (
      <div className={styles.choiceGridTwo}>
        {backgrounds?.map((background) => (
          <ChoiceButton
            key={background}
            active={selected.background === background}
            onClick={() => onChange({ background })}
          >
            <span className={styles.visualChoice}>
              <span
                aria-hidden="true"
                data-background={background}
                className={styles.backgroundSwatch}
              />
              <span>{dict.backgroundNames[background]}</span>
            </span>
          </ChoiceButton>
        ))}
      </div>
    );
  }

  if (controlId === "finish") {
    return (
      <div className={styles.choiceGridTwo}>
        {product.allowedFinishes?.map((finish) => (
          <ChoiceButton
            key={finish}
            active={selected.finish === finish}
            onClick={() => onChange({ finish })}
          >
            <span className={styles.visualChoice}>
              <span aria-hidden="true" data-finish={finish} className={styles.finishSwatch} />
              <span>{dict.finishNames[finish]}</span>
            </span>
          </ChoiceButton>
        ))}
      </div>
    );
  }

  if (controlId === "material") {
    return (
      <>
        <div className={styles.choiceGridThree}>
          {product.allowedMaterials?.map((material) => (
            <ChoiceButton
              key={material}
              active={selected.material === material}
              onClick={() => {
                const backgrounds = compactBackgroundsForMaterial(material);
                const currentBackground = selected.background ?? backgrounds[0];
                onChange({
                  material,
                  background: backgrounds.includes(currentBackground)
                    ? currentBackground
                    : backgrounds[0],
                });
              }}
            >
              <span className={styles.visualChoice}>
                <span aria-hidden="true" data-material={material} className={styles.materialSwatch} />
                <span>{dict.materialNames[material]}</span>
              </span>
            </ChoiceButton>
          ))}
        </div>
        {selected.material ? (
          <p className={styles.optionNote} data-active="true">
            {dict.materialDescriptions[selected.material]}
          </p>
        ) : null}
      </>
    );
  }

  if (controlId === "woodType") {
    return (
      <div className={styles.choiceGridThree}>
        {product.allowedWoodTypes?.map((woodType) => (
          <ChoiceButton
            key={woodType}
            active={selected.woodType === woodType}
            onClick={() => onChange({ woodType })}
          >
            <span className={styles.visualChoice}>
              <span aria-hidden="true" data-wood={woodType} className={styles.woodSwatch} />
              <span>{dict.woodTypeNames[woodType]}</span>
            </span>
          </ChoiceButton>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.choiceGridThree}>
      {product.allowedDimensions.map((dimension) => {
        const candidate = { ...selected, dimension };
        const measurement = exactDimension(candidate);
        return (
          <ChoiceButton
            key={dimension}
            active={selected.dimension === dimension}
            onClick={() => onChange({ dimension })}
            tooltip={
              measurement
                ? fmt(dict.exactDimension, { dimension: measurement })
                : undefined
            }
          >
            {dict.dimensionNames[dimension]}
          </ChoiceButton>
        );
      })}
    </div>
  );
}

export function OfferConfigurator({ initialSelection }: { initialSelection: OrderSelection }) {
  const router = useRouter();
  const reduceMotion = Boolean(useReducedMotion());
  const reserveLogo = useMutation(api.offerLogoUploads.reserve);
  const commitLogo = useMutation(api.offerLogoUploads.commit);
  const [selection, setSelection] = useState(() => copySelection(initialSelection));
  const [productDrafts, setProductDrafts] = useState(() =>
    buildProductDrafts(copySelection(initialSelection)),
  );
  const [activeProductId, setActiveProductId] = useState<ProductId>(
    initialSelection.products[0]?.productId ?? "two-piece-stand",
  );
  const [logoSessionToken] = useState(() =>
    typeof window === "undefined" ? "" : getOrCreateOfferLogoSession(),
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFileName, setLogoFileName] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [openControlSection, setOpenControlSection] = useState<ControlSectionId | "">(
    () => getProduct(activeProductId)?.controlIds[0] ?? "design",
  );
  const [logoState, setLogoState] = useState<"idle" | "uploading" | "ready" | "error">(
    initialSelection.logoUploadId ? "ready" : "idle",
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const productStrip = useRef<HTMLDivElement>(null);

  const persistedLogo = useQuery(
    api.offerLogoUploads.preview,
    selection.logoUploadId && logoSessionToken
      ? {
          uploadId: selection.logoUploadId as Id<"offerLogoUploads">,
          sessionToken: logoSessionToken,
        }
      : "skip",
  );

  const breakdown = useMemo(() => computeOrderBreakdown(selection), [selection]);
  const visibleLogoUrl = logoUrl ?? persistedLogo?.previewUrl ?? null;
  const visibleLogoFileName = logoFileName || persistedLogo?.fileName || "";
  const active = productDrafts[activeProductId];
  const activeCatalog = active ? getProduct(active.productId) : undefined;
  const activeCopy = active ? dict.products[active.productId] : null;

  useEffect(() => {
    const strip = productStrip.current;
    if (!strip || !window.matchMedia("(max-width: 1023px)").matches) return;
    const target = strip.querySelector<HTMLElement>(`[data-product-id="${activeProductId}"]`);
    if (!target) return;
    strip.scrollTo({
      left: target.offsetLeft - (strip.clientWidth - target.offsetWidth) / 2,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [activeProductId, reduceMotion]);

  function activateProduct(productId: ProductId) {
    if (productId !== activeProductId) {
      setOpenControlSection(getProduct(productId)?.controlIds[0] ?? "design");
    }
    setActiveProductId(productId);
  }

  function previewProduct(productId: ProductId) {
    activateProduct(productId);
  }

  function updateProduct(productId: ProductId, patch: Partial<ProductSelection>) {
    setProductDrafts((current) => ({
      ...current,
      [productId]: { ...current[productId], ...patch },
    }));
    setSelection((current) => ({
      ...current,
      products: current.products.map((product) =>
        product.productId === productId ? { ...product, ...patch } : product,
      ),
    }));
  }

  function changeService(service: ServiceId) {
    const normalizeProduct = (product: ProductSelection): ProductSelection =>
      service === "links" &&
      product.design.kind === "template" &&
      product.design.templateId === "basic"
        ? { ...product, design: { kind: "template", templateId: "template-1" } }
        : product;

    setSelection((current) => ({
      ...current,
      service,
      products: current.products.map(normalizeProduct),
    }));
    setProductDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).map(([productId, product]) => [
          productId,
          normalizeProduct(product),
        ]),
      ) as ProductDrafts,
    );
  }

  function setProductQuantity(productId: ProductId, quantity: number) {
    const nextQuantity = Math.max(0, Math.floor(quantity));
    activateProduct(productId);
    setSelection((current) => {
      const selected = current.products.find((product) => product.productId === productId);
      if (nextQuantity === 0) {
        return selected
          ? { ...current, products: current.products.filter((item) => item.productId !== productId) }
          : current;
      }
      if (selected) {
        return {
          ...current,
          products: current.products.map((product) =>
            product.productId === productId ? { ...product, quantity: nextQuantity } : product,
          ),
        };
      }
      return {
        ...current,
        products: [
          ...current.products,
          { ...copyProductSelection(productDrafts[productId]), quantity: nextQuantity },
        ],
      };
    });
  }

  function addProduct(productId: ProductId) {
    activateProduct(productId);
    setSelection((current) => {
      const selected = current.products.find((product) => product.productId === productId);
      if (selected) {
        return {
          ...current,
          products: current.products.map((product) =>
            product.productId === productId
              ? { ...product, quantity: product.quantity + 1 }
              : product,
          ),
        };
      }
      return {
        ...current,
        products: [
          ...current.products,
          { ...copyProductSelection(productDrafts[productId]), quantity: 1 },
        ],
      };
    });
  }

  function removeProduct(productId: ProductId) {
    setProductQuantity(productId, 0);
  }

  async function uploadLogo(file: File) {
    if (
      !logoSessionToken ||
      !["image/png", "image/svg+xml"].includes(file.type) ||
      file.size > MAX_LOGO_BYTES
    ) {
      setLogoState("error");
      return;
    }

    setLogoState("uploading");
    try {
      const reservation = await reserveLogo({ sessionToken: logoSessionToken, fileName: file.name });
      const response = await fetch(reservation.uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("upload");
      const payload = (await response.json()) as { storageId?: string };
      if (!payload.storageId) throw new Error("storage");
      const committed = await commitLogo({
        uploadId: reservation.uploadId,
        sessionToken: logoSessionToken,
        storageId: payload.storageId as Id<"_storage">,
      });
      if (committed.status !== "ready") throw new Error(committed.reason);
      setSelection((current) => ({ ...current, logoUploadId: reservation.uploadId }));
      setLogoFileName(file.name);
      setLogoUrl(committed.previewUrl);
      setLogoState("ready");
    } catch {
      setLogoState("error");
    }
  }

  function clearLogo() {
    setSelection((current) => ({ ...current, logoUploadId: undefined }));
    setLogoUrl(null);
    setLogoFileName("");
    setLogoState("idle");
    if (fileInput.current) fileInput.current.value = "";
  }

  function continueToReview() {
    if (!selection.products.length) return;
    router.push(`/ponuda/pregled?${encodeSelection(selection).toString()}`);
  }

  const previewKey = active
    ? [
        active.productId,
        active.orientation,
        active.shape,
        active.background,
        active.finish,
        active.material,
        active.woodType,
        active.dimension,
        active.design.kind === "template" ? active.design.templateId : "custom",
      ]
        .filter(Boolean)
        .join("-")
    : "empty";
  const saasChip = `${dict.serviceNames[selection.service]} · ${dict.tierNames[selection.tier]} · ${
    selection.period === "annual" ? dict.annual : dict.firstMonth
  }`;
  const sceneId = active ? PRODUCT_SCENES[active.productId] : "counter";

  return (
    <div id="konfigurator" data-reveal="off" className={`${styles.configurator} offer-surface`}>
      <div
        className={styles.stage}
        data-scene={sceneId}
        data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={sceneId}
            className={styles.sceneLayer}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          >
            <Image
              src={SCENE_ASSETS[sceneId]}
              alt=""
              fill
              sizes="(max-width: 767px) 100vw, (max-width: 1535px) 96vw, 1440px"
              loading="eager"
              fetchPriority="high"
              className={styles.sceneImage}
            />
          </motion.div>
        </AnimatePresence>
        <div aria-hidden="true" className={styles.sceneTone} />

        <section aria-labelledby="proizvodi-naslov" className={styles.productRail}>
          <h2 id="proizvodi-naslov" className={styles.railHeading}>
            {dict.productsHeading}
          </h2>

          <div ref={productStrip} className={styles.productList}>
            {PHYSICAL_PRODUCTS.map((product) => {
              const selected = selection.products.find((item) => item.productId === product.id);
              const isActive = active?.productId === product.id;
              const copy = dict.products[product.id];

              return (
                <article
                  key={product.id}
                  data-product-id={product.id}
                  data-active={isActive ? "true" : "false"}
                  data-selected={selected ? "true" : "false"}
                  className={styles.productCard}
                >
                  <div className={styles.productCardTop}>
                    <button
                      type="button"
                      onClick={() => previewProduct(product.id)}
                      aria-pressed={isActive}
                      className={"focus-signal " + styles.productButton}
                    >
                      <span className={styles.productThumb}>
                        <Image
                          src={product.previewAsset}
                          alt=""
                          fill
                          sizes="64px"
                          loading="eager"
                          className={styles.productThumbImage}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className={styles.productName}>{copy.name}</span>
                        <span className={styles.productPrice}>
                          {fmt(dict.priceFrom, { price: formatRsd(product.baseUnitPrice) })}
                        </span>
                      </span>
                    </button>
                    <span className={styles.productActions}>
                      {selected ? (
                        <span className={styles.quantityBadge}>{selected.quantity}</span>
                      ) : (
                        <span aria-hidden="true" className={styles.quantityBadgePlaceholder} />
                      )}
                      <button
                        type="button"
                        onClick={() => addProduct(product.id)}
                        className={"focus-signal " + styles.productAddButton}
                        aria-label={fmt(dict.quantityPlusOne, { product: copy.name })}
                      >
                        <Plus aria-hidden="true" className="size-4" strokeWidth={1.8} />
                      </button>
                    </span>
                  </div>

                  {isActive ? (
                    <div className={styles.activeDetails}>
                      <p>{copy.subtitle}</p>
                      <p className={styles.activeUseCase}>
                        <strong>{dict.useCase}: </strong>
                        {copy.useCase}
                      </p>
                    </div>
                  ) : null}

                  {isActive ? (
                    <div className={styles.quantityBlock}>
                      <div className={styles.quantityHeader}>
                        <span className={styles.quantityLabel}>{dict.quantity}</span>
                        {selected ? (
                          <button
                            type="button"
                            onClick={() => removeProduct(product.id)}
                            className={"focus-signal " + styles.removeButton}
                            aria-label={fmt(dict.removeProduct, { product: copy.name })}
                          >
                            <Trash2 aria-hidden="true" className="size-4" strokeWidth={1.6} />
                          </button>
                        ) : null}
                      </div>
                      <div className={styles.quantityStepper}>
                        {([-5, -1] as const).map((delta) => (
                          <button
                            type="button"
                            key={delta}
                            disabled={!selected}
                            onClick={() =>
                              setProductQuantity(product.id, (selected?.quantity ?? 0) + delta)
                            }
                            className={"focus-signal " + styles.quantityButton}
                            aria-label={fmt(
                              delta === -5 ? dict.quantityMinusFive : dict.quantityMinusOne,
                              { product: copy.name },
                            )}
                          >
                            {delta}
                          </button>
                        ))}
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={selected?.quantity ?? 0}
                          onChange={(event) =>
                            setProductQuantity(product.id, quantityFromDraftInput(event.target.value))
                          }
                          aria-label={fmt(dict.quantityInput, { product: copy.name })}
                          className={styles.quantityInput}
                        />
                        {([1, 5] as const).map((delta) => (
                          <button
                            type="button"
                            key={delta}
                            onClick={() =>
                              setProductQuantity(product.id, (selected?.quantity ?? 0) + delta)
                            }
                            className={"focus-signal " + styles.quantityButton}
                            aria-label={fmt(
                              delta === 1 ? dict.quantityPlusOne : dict.quantityPlusFive,
                              { product: copy.name },
                            )}
                          >
                            +{delta}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.previewZone} aria-live="polite">
          <div className={styles.previewHeader}>
            <div className={styles.previewCopy}>
              <p className={styles.previewKicker}>{dict.previewHeading}</p>
              <h2 className={styles.previewTitle}>
                {activeCopy?.name ?? dict.productsHeading}
              </h2>
              {activeCopy ? (
                <p className={styles.previewDescription}>
                  {activeCopy.subtitle}
                  <span className={styles.previewUseCase}>
                    <strong>{dict.useCase}: </strong>
                    {activeCopy.useCase}
                  </span>
                </p>
              ) : null}
            </div>

            <details className={styles.saasPicker}>
              <summary className={"focus-signal " + styles.saasSummary}>
                <span className="truncate">{saasChip}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={"size-4 shrink-0 transition-transform " + styles.saasChevron}
                />
                <span className="sr-only">{dict.saasPickerLabel}</span>
              </summary>
              <div className={styles.saasPopover}>
                <div className={styles.saasField}>
                  <span>{dict.saasService}</span>
                  <Select
                    value={selection.service}
                    onValueChange={(value) => changeService(value as ServiceId)}
                  >
                    <SelectTrigger className={styles.saasSelectTrigger} aria-label={dict.saasService}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={styles.saasSelectContent}>
                      {SERVICES.map((service) => (
                        <SelectItem key={service} value={service} className={styles.saasSelectItem}>
                          {dict.serviceNames[service]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.saasField}>
                  <span>{dict.saasTier}</span>
                  <Select
                    value={selection.tier}
                    onValueChange={(value) =>
                      setSelection((current) => ({
                        ...current,
                        tier: value as PublicTierId,
                      }))
                    }
                  >
                    <SelectTrigger className={styles.saasSelectTrigger} aria-label={dict.saasTier}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={styles.saasSelectContent}>
                      {TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier} className={styles.saasSelectItem}>
                          {dict.tierNames[tier]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className={styles.saasField}>
                  <span>{dict.saasPeriod}</span>
                  <Select
                    value={selection.period}
                    onValueChange={(value) =>
                      setSelection((current) => ({
                        ...current,
                        period: value as BillingPeriod,
                      }))
                    }
                  >
                    <SelectTrigger className={styles.saasSelectTrigger} aria-label={dict.saasPeriod}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={styles.saasSelectContent}>
                      {PERIODS.map((period) => (
                        <SelectItem key={period} value={period} className={styles.saasSelectItem}>
                          {dict.periodNames[period]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </details>
          </div>

          {selection.products.length > 1 ? (
            <div className={styles.previewSwitcher}>
              <Select
                value={active?.productId}
                onValueChange={(value) => activateProduct(value as ProductId)}
              >
                <SelectTrigger
                  className="h-10 w-full rounded-[0.75rem] border-white/40 bg-background/58 text-xs shadow-none backdrop-blur-sm"
                  aria-label={dict.previewProduct}
                >
                  <SelectValue placeholder={dict.previewProduct} />
                </SelectTrigger>
                <SelectContent className="rounded-[0.75rem] border-foreground/14 bg-popover shadow-none">
                  {PHYSICAL_PRODUCTS.map((product) => (
                    <SelectItem
                      key={product.id}
                      value={product.id}
                      className="rounded-[0.5rem]"
                    >
                      {dict.products[product.id].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {visibleLogoUrl ? (
            <p className={styles.logoNote}>
              <MonitorUp aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
              {dict.previewLogoNote}
            </p>
          ) : null}
        </section>

        <AnimatePresence mode="wait" initial={false}>
          {active ? (
            <motion.div
              key={previewKey}
              className={styles.productMotion}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
            >
              <OfferProductPreview selected={active} logoUrl={visibleLogoUrl} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <aside
          className={styles.controlSidebar + " " + styles.glassSurface}
          data-collapsed={sidebarCollapsed ? "true" : "false"}
        >
          <button
            type="button"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-controls="ponuda-kontrolni-panel"
            aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? dict.expandControls : dict.collapseControls}
            title={sidebarCollapsed ? dict.expandControls : dict.collapseControls}
            className={"focus-signal " + styles.sidebarToggle}
          >
            {sidebarCollapsed ? (
              <ChevronLeft aria-hidden="true" className="size-5" strokeWidth={2} />
            ) : (
              <ChevronRight aria-hidden="true" className="size-5" strokeWidth={2} />
            )}
          </button>

          <div id="ponuda-kontrolni-panel" className={styles.sidebarContent}>
            {active && activeCatalog ? (
              <Accordion
                type="single"
                value={openControlSection}
                onValueChange={(value) =>
                  setOpenControlSection(value as ControlSectionId | "")
                }
                collapsible
              >
              {activeCatalog.controlIds.map((controlId) => (
                <AccordionItem
                  key={controlId}
                  value={controlId}
                  className={styles.controlItem}
                >
                  <AccordionTrigger
                    className={styles.controlTrigger}
                    onClick={(event) => {
                      if (!sidebarCollapsed) return;
                      event.preventDefault();
                      setOpenControlSection(controlId);
                      setSidebarCollapsed(false);
                    }}
                  >
                    <AccordionLabel
                      icon={CONTROL_ICONS[controlId]}
                      title={controlTitle(controlId)}
                      value={controlValue(active, controlId)}
                    />
                  </AccordionTrigger>
                  <AccordionContent className={styles.controlShelf}>
                    <ConfigurationOptions
                      controlId={controlId}
                      selected={active}
                      product={activeCatalog}
                      onChange={(patch) => updateProduct(active.productId, patch)}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}

              <AccordionItem value="design" className={styles.controlItem}>
                <AccordionTrigger
                  className={styles.controlTrigger}
                  onClick={(event) => {
                    if (!sidebarCollapsed) return;
                    event.preventDefault();
                    setOpenControlSection("design");
                    setSidebarCollapsed(false);
                  }}
                >
                  <AccordionLabel
                    icon={Palette}
                    title={dict.designHeading}
                    value={
                      active.design.kind === "template"
                        ? dict.templateNames[active.design.templateId]
                        : dict.customDesign
                    }
                  />
                </AccordionTrigger>
                <AccordionContent className={styles.controlShelf}>
                  <div className={styles.templateGrid}>
                    {activeCatalog.allowedTemplateIds
                      .filter(
                        (templateId) =>
                          templateId !== "basic" || selection.service === "review",
                      )
                      .map((templateId) => {
                      const selectedTemplate =
                        active.design.kind === "template" &&
                        active.design.templateId === templateId;

                      return (
                        <button
                          type="button"
                          key={templateId}
                          aria-pressed={selectedTemplate}
                          data-active={selectedTemplate ? "true" : "false"}
                          onClick={() =>
                            updateProduct(active.productId, {
                              design: { kind: "template", templateId },
                            })
                          }
                          className={"focus-signal " + styles.templateOption}
                        >
                          <span className={styles.templateImage}>
                            {templateId === "basic" ? (
                              <BasicTemplateThumbnail />
                            ) : (
                              <Image
                                src={TEMPLATE_ASSETS[templateId]!}
                                alt=""
                                fill
                                sizes="150px"
                                className="object-cover object-top"
                              />
                            )}
                            {selectedTemplate ? (
                              <span className={styles.templateCheck}>
                                <Check
                                  aria-hidden="true"
                                  className="size-3.5"
                                  strokeWidth={2}
                                />
                              </span>
                            ) : null}
                          </span>
                          <span className={styles.templateMeta}>
                            {dict.templateNames[templateId]}
                            <span className={styles.templateIncluded}>
                              {dict.templateIncluded}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className={styles.customPanelSlot}
                    data-custom={active.design.kind === "custom" ? "true" : "false"}
                  >
                    <button
                      type="button"
                      tabIndex={active.design.kind === "custom" ? -1 : 0}
                      aria-pressed={active.design.kind === "custom"}
                      data-active={active.design.kind === "custom" ? "true" : "false"}
                      onClick={() =>
                        updateProduct(active.productId, {
                          design: {
                            kind: "custom",
                            brief: active.design.kind === "custom" ? active.design.brief : "",
                          },
                        })
                      }
                      className={"focus-signal " + styles.customOption}
                    >
                      <ImagePlus aria-hidden="true" className="size-5" strokeWidth={1.5} />
                      <span className={styles.customTitle}>{dict.customDesign}</span>
                      <span className={styles.customPrice}>{dict.customPrice}</span>
                    </button>
                    <label
                      aria-hidden={active.design.kind !== "custom"}
                      className={styles.customBrief}
                    >
                      <span className={styles.briefHeader}>
                        {dict.customBriefLabel}
                        <span className={styles.briefCount}>
                          {active.design.kind === "custom" ? active.design.brief.length : 0}/500
                        </span>
                      </span>
                      <Textarea
                        value={active.design.kind === "custom" ? active.design.brief : ""}
                        disabled={active.design.kind !== "custom"}
                        maxLength={500}
                        rows={3}
                        onChange={(event) =>
                          updateProduct(active.productId, {
                            design: { kind: "custom", brief: event.target.value },
                          })
                        }
                        placeholder={dict.customBody}
                        className={styles.briefInput}
                      />
                    </label>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="logo" className={styles.controlItem}>
                <AccordionTrigger
                  className={styles.controlTrigger}
                  onClick={(event) => {
                    if (!sidebarCollapsed) return;
                    event.preventDefault();
                    setOpenControlSection("logo");
                    setSidebarCollapsed(false);
                  }}
                >
                  <AccordionLabel
                    icon={Layers3}
                    title={dict.logoHeading}
                    value={selection.logoUploadId ? dict.logoReady : dict.logoFree}
                  />
                </AccordionTrigger>
                <AccordionContent className={styles.controlShelf}>
                  <p className={styles.logoBody}>{dict.logoBody}</p>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/png,image/svg+xml"
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadLogo(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={logoState === "uploading"}
                    onClick={() => fileInput.current?.click()}
                    className={"focus-signal " + styles.logoButton}
                  >
                    {logoState === "uploading" ? (
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <ImagePlus aria-hidden="true" className="size-4" strokeWidth={1.6} />
                    )}
                    {logoState === "uploading"
                      ? dict.logoUploading
                      : selection.logoUploadId
                        ? dict.logoReplace
                        : dict.logoChoose}
                  </Button>
                  <p className={styles.logoHint}>{dict.logoFileHint}</p>

                  {logoState === "ready" ? (
                    <div className={styles.logoReadyRow}>
                      <span className={styles.logoFileName}>
                        {visibleLogoFileName || dict.logoReady}
                      </span>
                      <button
                        type="button"
                        onClick={clearLogo}
                        className={"focus-signal " + styles.logoRemove}
                      >
                        {dict.logoRemove}
                      </button>
                    </div>
                  ) : logoState === "error" ? (
                    <p role="alert" className={styles.logoError}>
                      {dict.logoError}
                    </p>
                  ) : null}
                </AccordionContent>
              </AccordionItem>
              </Accordion>
            ) : null}
          </div>
        </aside>

        <div className={styles.priceDock}>
          <details className={styles.priceDetails}>
            <summary className={"focus-signal " + styles.priceSummary}>
              <span>
                <span className={styles.priceSummaryLabel}>
                  {breakdown.requiresCustomDesignQuote
                    ? dict.subtotalWithoutCustom
                    : dict.totalNow}
                </span>
                <span className={styles.priceSummaryValue}>
                  {formatRsd(breakdown.totalDueNow)} <small>RSD</small>
                </span>
              </span>
              <span className={styles.priceStatus}>
                {breakdown.requiresCustomDesignQuote ? dict.customPrice : dict.calculation}
                <ChevronDown
                  aria-hidden="true"
                  className={"size-4 transition-transform " + styles.priceChevron}
                />
              </span>
            </summary>
            <div className={styles.priceBreakdown}>
              {breakdown.productItems.map((item) => (
                <div key={item.productId} className={styles.priceLine}>
                  <span className={styles.priceLineLabel}>
                    {dict.products[item.productId].name} × {item.quantity}
                    {item.discountRate ? (
                      <span className={styles.discountLabel}>
                        {fmt(dict.discount, {
                          percent: Math.round(item.discountRate * 100),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.priceNumber}>{formatRsd(item.lineTotal)} RSD</span>
                </div>
              ))}
              <div className={styles.priceLine}>
                <span className={styles.priceLineLabel}>
                  {dict.saasSubscription} (
                  {selection.period === "annual" ? dict.annual : dict.firstMonth})
                </span>
                <span className={styles.priceNumber}>
                  {formatRsd(breakdown.saasFirstTerm)} RSD
                </span>
              </div>
              <p className={styles.renewalNote}>
                {dict.renewal}: {formatRsd(breakdown.renewal.amount)}{" "}
                {selection.period === "annual"
                  ? dict.renewalAnnual
                  : dict.renewalMonthly}
                . {dict.renewalNote}
              </p>
              <p className={styles.vatNote}>{dict.priceVatIncluded}</p>
            </div>
          </details>

          <Button
            type="button"
            onClick={continueToReview}
            disabled={!selection.products.length}
            className={"focus-signal " + styles.dockButton}
          >
            {breakdown.requiresCustomDesignQuote ? dict.sendInquiry : dict.confirm}
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
          </Button>
        </div>
      </div>

      <div className={styles.mobileDock}>
        <div className={styles.mobileDockInner}>
          <span className={styles.mobileTotal}>
            <span className={styles.mobileTotalLabel}>
              {breakdown.requiresCustomDesignQuote
                ? dict.subtotalWithoutCustom
                : dict.mobileCalculation}
            </span>
            <span className={styles.mobileTotalValue}>
              {formatRsd(breakdown.totalDueNow)} RSD
            </span>
          </span>
          <Button
            type="button"
            onClick={continueToReview}
            disabled={!selection.products.length}
            className={"focus-signal " + styles.mobileButton}
          >
            {breakdown.requiresCustomDesignQuote ? dict.sendInquiry : dict.confirm}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
