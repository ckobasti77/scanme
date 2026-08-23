"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus, QrCode, Trash2 } from "lucide-react";
import {
  CUSTOM_DESIGN_FEE,
  PHYSICAL_PRODUCTS,
  computeOrderBreakdown,
  formatRsd,
  getMaterial,
  type BillingPeriod,
  type DesignChoice,
  type OrderBreakdown,
  type OrderSelection,
  type PhysicalProduct,
  type PhysicalTier,
  type ProductSelection,
  type PublicTierId,
  type ServiceId,
} from "@/lib/scanme-pricing";
import { encodeSelection } from "@/lib/offer-url";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Interni id gotovog šablona. Konkretni šabloni se biraju kasnije u toku —
// ovde je dizajn binarni izbor: gotov šablon (bez naknade) ili custom (naknada).
const TEMPLATE_ID = "standard";

const SERVICE_OPTIONS: Array<{ value: ServiceId; label: string }> = [
  { value: "review", label: "ScanMe Review" },
  { value: "links", label: "ScanMe Links" },
];
const TIER_OPTIONS: Array<{ value: PublicTierId; label: string }> = [
  { value: "starter", label: "Starter" },
  { value: "premium", label: "Premium" },
];
const PERIOD_OPTIONS: Array<{ value: BillingPeriod; label: string }> = [
  { value: "monthly", label: "Mesečno" },
  { value: "annual", label: "Godišnje" },
];

const TIER_SECTIONS: Array<{ tier: PhysicalTier; title: string; note: string }> = [
  {
    tier: "standard",
    title: "Standardni proizvodi",
    note: "Svakodnevni formati za brzo postavljanje.",
  },
  {
    tier: "premium",
    title: "Premium proizvodi",
    note: "Izdvojeni materijali za trajniji utisak.",
  },
];

/** Dvo-opciono segmentirano dugme — isti jezik kao pricing prekidači. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  const secondActive = value === options[1]?.value;
  return (
    <div
      role="group"
      aria-label={label}
      className="relative inline-flex w-full rounded-[1rem] border border-foreground/16 bg-card p-1"
    >
      <span
        aria-hidden="true"
        style={{ transform: secondActive ? "translateX(100%)" : "translateX(0)" }}
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[0.5rem] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
      />
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-signal relative z-10 inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap px-3 text-sm font-semibold tracking-[-0.02em] transition-colors duration-200",
              active ? "text-primary-foreground" : "text-foreground/60 hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Neutralan, namerno privremen vizuelni blok umesto fotografije. */
function ProductThumb() {
  return (
    <div
      className="flex aspect-[4/3] items-center justify-center border border-foreground/12 bg-foreground/[0.035]"
      aria-hidden="true"
    >
      <QrCode className="size-7 text-foreground/25" strokeWidth={1.5} />
    </div>
  );
}

function QuantityStepper({
  quantity,
  productName,
  onChange,
}: {
  quantity: number;
  productName: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center border border-foreground/16">
      <button
        type="button"
        aria-label={`Smanji tiraž — ${productName}`}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
        className="focus-signal inline-flex size-10 items-center justify-center text-foreground transition-colors hover:bg-foreground/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Minus className="size-4" strokeWidth={2} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Tiraž — ${productName}`}
        value={quantity}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, "");
          onChange(digits === "" ? 1 : Math.max(1, Number.parseInt(digits, 10)));
        }}
        className="focus-signal h-10 w-12 border-x border-foreground/16 bg-transparent text-center text-sm font-semibold tabular-nums"
      />
      <button
        type="button"
        aria-label={`Povećaj tiraž — ${productName}`}
        onClick={() => onChange(quantity + 1)}
        className="focus-signal inline-flex size-10 items-center justify-center text-foreground transition-colors hover:bg-foreground/[0.06]"
      >
        <Plus className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function ProductCard({
  product,
  selection,
  onAdd,
  onRemove,
  onMaterial,
  onQuantity,
}: {
  product: PhysicalProduct;
  selection: ProductSelection | undefined;
  onAdd: () => void;
  onRemove: () => void;
  onMaterial: (materialId: string) => void;
  onQuantity: (quantity: number) => void;
}) {
  const selected = selection !== undefined;
  const activeMaterial = selection
    ? getMaterial(product, selection.materialId)
    : product.materials[0];
  const fromPrice = Math.min(...product.materials.map((material) => material.unitPrice));

  return (
    <article
      className={cn(
        "flex flex-col border bg-card p-4 transition-colors sm:p-5",
        selected ? "border-primary shadow-[0_0_0_1px_var(--primary)]" : "border-foreground/14",
      )}
    >
      <ProductThumb />
      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.03em]">{product.name}</h3>
          <p className="mt-1 text-xs text-foreground/54">
            Od {formatRsd(fromPrice)} RSD/kom
          </p>
        </div>
        {selected ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Ukloni ${product.name}`}
            className="focus-signal inline-flex size-9 shrink-0 items-center justify-center border border-foreground/16 text-foreground/70 transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      {selected && activeMaterial ? (
        <div className="mt-4 grid gap-4 border-t border-foreground/12 pt-4">
          <div>
            <p className="text-xs font-medium text-foreground/54" id={`mat-${product.id}`}>
              Materijal
            </p>
            <div
              role="radiogroup"
              aria-labelledby={`mat-${product.id}`}
              className="mt-2 flex flex-wrap gap-2"
            >
              {product.materials.map((material) => {
                const active = material.id === selection.materialId;
                return (
                  <button
                    key={material.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onMaterial(material.id)}
                    className={cn(
                      "focus-signal inline-flex min-h-9 items-center gap-2 border px-3 text-xs font-semibold transition-colors",
                      active
                        ? "border-primary text-accent-readable"
                        : "border-foreground/16 text-foreground/64 hover:border-foreground/32 hover:text-foreground",
                    )}
                  >
                    {active ? <Check className="size-3.5 text-primary" strokeWidth={2.5} /> : null}
                    {material.name}
                    <span className="text-foreground/44">{formatRsd(material.unitPrice)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-foreground/54">Tiraž</span>
            <QuantityStepper
              quantity={selection.quantity}
              productName={product.name}
              onChange={onQuantity}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          className="button-secondary focus-signal mt-4 w-full"
        >
          <Plus className="size-4" strokeWidth={2} />
          Dodaj
        </button>
      )}
    </article>
  );
}

function DesignControls({
  design,
  onKindChange,
  onLogoChange,
}: {
  design: DesignChoice;
  onKindChange: (kind: DesignChoice["kind"]) => void;
  onLogoChange: (addOwnLogo: boolean) => void;
}) {
  const options: Array<{
    kind: DesignChoice["kind"];
    title: string;
    body: string;
    price: string;
  }> = [
    {
      kind: "template",
      title: "Gotov dizajn",
      body: "Biramo raspored iz ScanMe šablona i prilagodimo ga vašem sadržaju.",
      price: "Uključeno",
    },
    {
      kind: "custom",
      title: "Custom dizajn",
      body: "Dizajn po meri za celu porudžbinu — naplaćuje se jednom, važi za sve stavke.",
      price: `+${formatRsd(CUSTOM_DESIGN_FEE)} RSD`,
    },
  ];

  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Dizajn</legend>
        {options.map((option) => (
          <label
            key={option.kind}
            className="flex cursor-pointer flex-col border border-foreground/14 bg-card p-4 transition-colors has-[:checked]:border-primary has-[:checked]:shadow-[0_0_0_1px_var(--primary)]"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-[-0.02em]">
                <input
                  type="radio"
                  name="design-kind"
                  value={option.kind}
                  checked={design.kind === option.kind}
                  onChange={() => onKindChange(option.kind)}
                  className="focus-signal size-4 accent-[var(--primary)]"
                />
                {option.title}
              </span>
              <span className="text-xs font-semibold text-accent-readable">{option.price}</span>
            </span>
            <span className="mt-2 pl-6 text-xs leading-5 text-foreground/56">{option.body}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex cursor-pointer items-start gap-3 border border-foreground/14 bg-card p-4">
        <input
          type="checkbox"
          checked={design.addOwnLogo}
          onChange={(event) => onLogoChange(event.target.checked)}
          className="focus-signal mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span className="grid gap-1">
          <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-[-0.02em]">
            Dodajte svoj logo
            <span className="text-xs font-semibold text-accent-readable">Besplatno</span>
          </span>
          <span className="text-xs leading-5 text-foreground/56">
            Ubacujemo vaš logo u dizajn bez dodatne naknade.
          </span>
        </span>
      </label>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  muted,
}: {
  label: ReactNode;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className={muted ? "text-foreground/54" : "text-foreground/72"}>{label}</span>
      <span className={cn("tabular-nums", muted ? "text-foreground/54" : "font-medium")}>{value}</span>
    </div>
  );
}

function Breakdown({
  breakdown,
  selection,
  hasProducts,
}: {
  breakdown: OrderBreakdown;
  selection: OrderSelection;
  hasProducts: boolean;
}) {
  const annual = selection.period === "annual";

  return (
    <div aria-live="polite" className="grid gap-5">
      <h2 className="text-lg font-semibold tracking-[-0.03em]">Obračun</h2>

      {hasProducts ? (
        <>
          <div className="grid gap-3">
            {breakdown.productItems.map((item, index) => (
              <div key={`${item.productId}-${index}`} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-medium">
                    {item.productName}
                    <span className="text-foreground/54"> · {item.materialName}</span>
                  </span>
                  <span className="tabular-nums font-medium">{formatRsd(item.lineTotal)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4 text-xs text-foreground/54">
                  <span>
                    {item.quantity} × {formatRsd(item.unitPrice)} RSD
                    {item.discountRate > 0
                      ? ` · popust −${Math.round(item.discountRate * 100)}%`
                      : ""}
                  </span>
                  {item.discountRate > 0 ? (
                    <span className="tabular-nums">−{formatRsd(item.lineDiscount)}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-2 border-t border-foreground/12 pt-4">
            <BreakdownRow label="Proizvodi" value={`${formatRsd(breakdown.productsTotal)} RSD`} />
            <BreakdownRow
              label={selection.design.kind === "custom" ? "Custom dizajn" : "Gotov dizajn"}
              value={
                breakdown.designFee > 0 ? `${formatRsd(breakdown.designFee)} RSD` : "Uključeno"
              }
              muted={breakdown.designFee === 0}
            />
            {selection.design.addOwnLogo ? (
              <BreakdownRow label="Sopstveni logo" value="Besplatno" muted />
            ) : null}
            <BreakdownRow
              label="Jednokratno ukupno"
              value={`${formatRsd(breakdown.oneTimeTotal)} RSD`}
            />
          </div>
        </>
      ) : (
        <div className="border border-dashed border-foreground/20 bg-foreground/[0.02] p-4">
          <p className="text-sm font-medium">Još nema izabranih proizvoda</p>
          <p className="mt-1 text-xs leading-5 text-foreground/56">
            Dodajte bar jedan fizički proizvod da biste videli obračun i nastavili na pregled.
            Pretplata ispod je već uračunata.
          </p>
        </div>
      )}

      <div className="grid gap-2 border-t border-foreground/12 pt-4">
        <BreakdownRow
          label={`ScanMe pretplata (${annual ? "godišnje" : "prvi mesec"})`}
          value={`${formatRsd(breakdown.saasFirstTerm)} RSD`}
        />
        <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-foreground/12 pt-3">
          <span className="text-sm font-semibold tracking-[-0.02em]">Ukupno sada</span>
          <span className="text-2xl font-semibold tracking-[-0.04em] tabular-nums">
            {formatRsd(breakdown.totalDueNow)} <span className="text-sm font-medium text-foreground/58">RSD</span>
          </span>
        </div>
        <p className="text-xs leading-5 text-foreground/54">
          {annual
            ? `Obnova pretplate: ${formatRsd(breakdown.renewal.amount)} RSD/god (≈ ${formatRsd(
                breakdown.renewal.monthlyEquivalent,
              )} RSD/mes). Fizički proizvodi i dizajn se ne naplaćuju ponovo.`
            : `Zatim ${formatRsd(breakdown.renewal.amount)} RSD/mes za pretplatu. Fizički proizvodi i dizajn se ne naplaćuju ponovo.`}
        </p>
      </div>
    </div>
  );
}

export function OfferConfigurator({
  initialSelection,
}: {
  initialSelection: OrderSelection;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState<OrderSelection>(initialSelection);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { service, tier, period, products, design } = selection;

  // URL sinhronizacija samo za service/tier/period (plitko, bez skrola).
  useEffect(() => {
    const params = new URLSearchParams({ service, tier, period });
    const next = `?${params.toString()}`;
    if (typeof window !== "undefined" && window.location.search !== next) {
      router.replace(next, { scroll: false });
    }
  }, [service, tier, period, router]);

  const breakdown = useMemo(() => computeOrderBreakdown(selection), [selection]);
  const hasProducts = products.length > 0;

  const selectionFor = useCallback(
    (productId: string) => products.find((item) => item.productId === productId),
    [products],
  );

  function addProduct(product: PhysicalProduct) {
    setSelection((current) => {
      if (current.products.some((item) => item.productId === product.id)) return current;
      return {
        ...current,
        products: [
          ...current.products,
          { productId: product.id, materialId: product.materials[0].id, quantity: 1 },
        ],
      };
    });
  }

  function removeProduct(productId: string) {
    setSelection((current) => ({
      ...current,
      products: current.products.filter((item) => item.productId !== productId),
    }));
  }

  function updateProduct(productId: string, patch: Partial<ProductSelection>) {
    setSelection((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.productId === productId ? { ...item, ...patch } : item,
      ),
    }));
  }

  function setDesignKind(kind: DesignChoice["kind"]) {
    setSelection((current) => ({
      ...current,
      design:
        kind === "custom"
          ? { kind: "custom", addOwnLogo: current.design.addOwnLogo }
          : { kind: "template", templateId: TEMPLATE_ID, addOwnLogo: current.design.addOwnLogo },
    }));
  }

  function setLogo(addOwnLogo: boolean) {
    setSelection((current) => ({ ...current, design: { ...current.design, addOwnLogo } }));
  }

  function confirm() {
    if (!hasProducts) return;
    router.push(`/ponuda/pregled?${encodeSelection(selection).toString()}`);
  }

  return (
    <div className="grid gap-10 pb-28 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-12 lg:pb-0">
      {/* Konfiguracija */}
      <div className="grid gap-12">
        {/* 1. Fizički proizvodi */}
        <section aria-labelledby="proizvodi-naslov">
          <h2 id="proizvodi-naslov" className="text-xl font-semibold tracking-[-0.035em]">
            Fizički proizvodi
          </h2>
          <p className="mt-2 max-w-[56ch] text-sm leading-6 text-foreground/58">
            Dodajte jednu ili više vrsta. Svaka vrsta ima svoj materijal i tiraž, a količinski
            popust se računa zasebno po vrsti. Paket ne ograničava broj ni vrstu proizvoda.
          </p>

          <div className="mt-7 grid gap-8">
            {TIER_SECTIONS.map((tierSection) => {
              const items = PHYSICAL_PRODUCTS.filter(
                (product) => product.tier === tierSection.tier,
              );
              return (
                <div key={tierSection.tier}>
                  <div className="flex items-baseline gap-3">
                    <p className="accent-label text-xs font-semibold">{tierSection.title}</p>
                    <p className="text-xs text-foreground/48">{tierSection.note}</p>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        selection={selectionFor(product.id)}
                        onAdd={() => addProduct(product)}
                        onRemove={() => removeProduct(product.id)}
                        onMaterial={(materialId) => updateProduct(product.id, { materialId })}
                        onQuantity={(quantity) => updateProduct(product.id, { quantity })}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 2. Dizajn + logo */}
        <section aria-labelledby="dizajn-naslov">
          <h2 id="dizajn-naslov" className="text-xl font-semibold tracking-[-0.035em]">
            Dizajn
          </h2>
          <p className="mt-2 max-w-[56ch] text-sm leading-6 text-foreground/58">
            Izaberite gotov šablon ili custom dizajn. Custom se naplaćuje tačno jednom po
            porudžbini i primenjuje na sve stavke.
          </p>
          <div className="mt-5">
            <DesignControls
              design={design}
              onKindChange={setDesignKind}
              onLogoChange={setLogo}
            />
          </div>
        </section>

        {/* 3. ScanMe pretplata */}
        <section aria-labelledby="pretplata-naslov">
          <h2 id="pretplata-naslov" className="text-xl font-semibold tracking-[-0.035em]">
            ScanMe pretplata
          </h2>
          <p className="mt-2 max-w-[56ch] text-sm leading-6 text-foreground/58">
            Digitalni deo ScanMe sistema. Utiče samo na pretplatu i njenu obnovu, ne na fizičke
            proizvode.
          </p>
          <div className="mt-5 grid gap-5 sm:max-w-md">
            <div className="grid gap-2">
              <span className="text-xs font-medium text-foreground/54">Usluga</span>
              <Segmented
                label="Usluga"
                value={service}
                options={SERVICE_OPTIONS}
                onChange={(next) => setSelection((current) => ({ ...current, service: next }))}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-xs font-medium text-foreground/54">Paket</span>
              <Segmented
                label="Paket"
                value={tier}
                options={TIER_OPTIONS}
                onChange={(next) => setSelection((current) => ({ ...current, tier: next }))}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-xs font-medium text-foreground/54">Naplata</span>
              <Segmented
                label="Način naplate"
                value={period}
                options={PERIOD_OPTIONS}
                onChange={(next) => setSelection((current) => ({ ...current, period: next }))}
              />
            </div>
          </div>
        </section>
      </div>

      {/* Obračun — desktop sticky aside */}
      <aside className="hidden lg:block">
        <div className="lg:sticky lg:top-24">
          <div className="border border-foreground/14 bg-card p-6">
            <Breakdown breakdown={breakdown} selection={selection} hasProducts={hasProducts} />
            <div className="mt-6 grid gap-2">
              <button
                type="button"
                onClick={confirm}
                disabled={!hasProducts}
                aria-describedby={!hasProducts ? "potvrdi-razlog" : undefined}
                className="button-primary focus-signal w-full"
              >
                Potvrdi izbor
              </button>
              {!hasProducts ? (
                <p id="potvrdi-razlog" className="text-xs leading-5 text-foreground/56">
                  Dodajte bar jedan proizvod da biste nastavili na pregled.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </aside>

      {/* Obračun — mobilna lepljiva traka + Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-foreground/14 bg-background/95 backdrop-blur lg:hidden">
        <div className="section-shell flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="text-xs text-foreground/54">Ukupno sada</p>
            <p className="truncate text-lg font-semibold tracking-[-0.03em] tabular-nums">
              {formatRsd(breakdown.totalDueNow)} <span className="text-xs font-medium text-foreground/58">RSD</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button type="button" className="button-secondary focus-signal">
                  Obračun
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="max-h-[80dvh] overflow-y-auto border-foreground/15 bg-background pb-8"
              >
                <SheetHeader className="text-left">
                  <SheetTitle>Obračun ponude</SheetTitle>
                  <SheetDescription className="text-foreground/60">
                    Uživo se menja dok birate proizvode i pretplatu.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-2">
                  <Breakdown
                    breakdown={breakdown}
                    selection={selection}
                    hasProducts={hasProducts}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <button
              type="button"
              onClick={confirm}
              disabled={!hasProducts}
              className="button-primary focus-signal"
            >
              Potvrdi
            </button>
          </div>
        </div>
        {!hasProducts ? (
          <p className="section-shell pb-2 text-xs text-foreground/56" role="status">
            Dodajte bar jedan proizvod da biste nastavili.
          </p>
        ) : null}
      </div>
    </div>
  );
}
