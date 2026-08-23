"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  computeCardPrice,
  formatRsd,
  type BillingPeriod,
  type PublicTierId,
  type ServiceId,
} from "@/lib/scanme-pricing";
import { ENTERPRISE_CONTACT_HREF } from "@/lib/offer-contact";

type CardTier = PublicTierId | "enterprise";

type TierCard = {
  tier: CardTier;
  name: string;
  description: string;
  features: string[];
  highlighted?: boolean;
};

const SERVICE_OPTIONS: Array<{ value: ServiceId; label: string }> = [
  { value: "review", label: "ScanMe Review" },
  { value: "links", label: "ScanMe Links" },
];

const ENTERPRISE_CARD: TierCard = {
  tier: "enterprise",
  name: "Enterprise",
  description: "Za više lokacija i uslove po meri.",
  features: [
    "Centralno upravljanje većim brojem lokacija",
    "Zajednička analitika za više lokacija",
    "Dizajn i funkcionalnost po meri",
    "Prioritetna podrška i uslovi po meri",
  ],
};

const SERVICE_CARDS: Record<ServiceId, TierCard[]> = {
  review: [
    {
      tier: "starter",
      name: "Starter",
      description: "Za lokal koji počinje da skuplja recenzije.",
      features: [
        "Jedna aktivna Review destinacija za jednu lokaciju",
        "Osnovna analitika",
      ],
    },
    {
      tier: "premium",
      name: "Premium",
      description: "Za timove kojima treba pun uvid i podrška.",
      highlighted: true,
      features: [
        "Povezivanje sa Google Business profilom",
        "Naprednija analitika",
        "Viši nivo podrške",
      ],
    },
    ENTERPRISE_CARD,
  ],
  links: [
    {
      tier: "starter",
      name: "Starter",
      description: "Prva ScanMe Links stranica vašeg biznisa.",
      features: [
        "Jedna Links stranica",
        "Osnovne funkcije uređivanja",
        "Osnovna analitika",
        "Izbor osnovnih dizajnerskih opcija ili template-a",
      ],
    },
    {
      tier: "premium",
      name: "Premium",
      description: "Napredniji editor i dublja analitika.",
      highlighted: true,
      features: [
        "Sve iz Starter paketa",
        "Premium opcije u editoru",
        "Naprednija analitika",
        "Viši nivo podrške",
      ],
    },
    ENTERPRISE_CARD,
  ],
};

function ServiceSwitcher({
  service,
  onChange,
}: {
  service: ServiceId;
  onChange: (next: ServiceId) => void;
}) {
  const linksActive = service === "links";

  return (
    <div className="mt-9 flex justify-center">
      <div
        role="group"
        aria-label="Izaberite uslugu"
        className="relative inline-flex w-full max-w-md rounded-[1.15rem] border border-foreground/16 bg-card p-1"
      >
        {/* Klizni indikator; radius je pola okvira (okvir 1.15rem, indikator 0.65rem). */}
        <span
          aria-hidden="true"
          style={{ transform: linksActive ? "translateX(100%)" : "translateX(0)" }}
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[0.65rem] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        />
        {SERVICE_OPTIONS.map((option) => {
          const active = service === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={[
                "focus-signal relative z-10 inline-flex min-h-12 flex-1 items-center justify-center whitespace-nowrap px-3 text-[0.8125rem] font-semibold tracking-[-0.02em] transition-colors duration-200 sm:text-sm",
                active ? "text-primary-foreground" : "text-foreground/62 hover:text-foreground",
              ].join(" ")}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PeriodToggle({
  period,
  onChange,
}: {
  period: BillingPeriod;
  onChange: (next: BillingPeriod) => void;
}) {
  const options = [
    { value: "monthly", label: "Mesečno" },
    { value: "annual", label: "Godišnje" },
  ] as const;
  const annual = period === "annual";

  return (
    <div className="mt-5 flex justify-center">
      <div
        role="group"
        aria-label="Način naplate"
        className="relative inline-flex w-72 rounded-[1rem] border border-foreground/16 bg-card p-1"
      >
        {/* Klizni zeleni indikator; radius je pola okvira (okvir 1rem, indikator 0.5rem). */}
        <span
          aria-hidden="true"
          style={{ transform: annual ? "translateX(100%)" : "translateX(0)" }}
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[0.5rem] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        />
        {options.map((option) => {
          const active = period === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={[
                "focus-signal relative z-10 inline-flex min-h-10 flex-1 items-center justify-center gap-2 text-sm font-semibold tracking-[-0.02em] transition-colors duration-200",
                active ? "text-primary-foreground" : "text-foreground/60 hover:text-foreground",
              ].join(" ")}
            >
              {option.label}
              {option.value === "annual" ? (
                <span
                  className={[
                    "border px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none transition-colors duration-200",
                    active
                      ? "border-primary-foreground/30 text-primary-foreground"
                      : "border-foreground/20 text-foreground/60",
                  ].join(" ")}
                >
                  −17%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CardPrice({
  service,
  tier,
  name,
  period,
}: {
  service: ServiceId;
  tier: PublicTierId;
  name: string;
  period: BillingPeriod;
}) {
  const price = computeCardPrice(service, tier, period);
  const annual = period === "annual";

  return (
    <div
      className="mt-6 min-h-[12.25rem] border-t border-foreground/12 pt-6"
      aria-live="polite"
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-sm font-medium text-foreground/58">Od</span>
        <span className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
          {formatRsd(price.fromAmount)}
        </span>
        <span className="text-sm font-medium text-foreground/58">
          {annual ? "RSD/mes" : "RSD"}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-foreground/48">
        {annual ? "za prvu godinu" : "za prvi mesec"}
      </p>
      {annual ? (
        <>
          <p className="mt-2 text-xs leading-5 text-foreground/48">
            Uključuje 1 fizički proizvod + 12 meseci {name} plana
          </p>
          <p className="mt-1 text-xs leading-5 text-foreground/48">
            Obnova: {formatRsd(price.renewalAmount)} RSD/mes uz godišnje plaćanje
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs leading-5 text-foreground/48">
          Zatim {formatRsd(price.renewalAmount)} RSD/mes
        </p>
      )}
    </div>
  );
}

export function PricingPlans() {
  const [service, setService] = useState<ServiceId>("review");
  const [period, setPeriod] = useState<BillingPeriod>("annual");

  const cards = SERVICE_CARDS[service];

  return (
    <>
      <div data-reveal-group>
        <p className="accent-label text-sm font-medium">ScanMe paketi</p>
        <h2 className="mt-5 max-w-[16ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
          Izaberite uslugu i paket po meri.
        </h2>
        <p className="mt-6 max-w-[52ch] leading-7 text-foreground/62">
          Svaka „Od“ cena spaja najjeftiniji fizički proizvod i pretplatu za izabrani period. Dizajn, štampa i dinamički QR su uključeni.
        </p>
        <ServiceSwitcher service={service} onChange={setService} />
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      <div
        data-reveal-group
        className="mt-14 grid gap-4 sm:gap-5 lg:mt-16 lg:grid-cols-3"
      >
        {cards.map((card) => {
          const isEnterprise = card.tier === "enterprise";
          const cta = isEnterprise ? "Zatraži ponudu" : "Započnite";
          const href = isEnterprise
            ? ENTERPRISE_CONTACT_HREF
            : `/ponuda?service=${service}&tier=${card.tier}&period=${period}`;

          return (
            <article
              key={card.tier}
              className={[
                "flex flex-col border border-foreground/14 bg-card p-7 sm:p-8",
                card.highlighted ? "shadow-[0_0_0_2px_var(--primary)] lg:-my-2 lg:py-10" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-xl font-semibold tracking-[-0.035em]">{card.name}</h3>
                {card.highlighted ? (
                  <span className="accent-label text-xs font-semibold">Najpopularnije</span>
                ) : null}
              </div>

              <p className="mt-3 min-h-12 text-sm leading-6 text-foreground/58">
                {card.description}
              </p>

              {card.tier === "enterprise" ? (
                <div className="mt-6 min-h-[12.25rem] border-t border-foreground/12 pt-6">
                  <p className="text-4xl font-semibold tracking-[-0.05em] text-balance sm:text-5xl">
                    Cena na upit
                  </p>
                </div>
              ) : (
                <CardPrice
                  service={service}
                  tier={card.tier}
                  name={card.name}
                  period={period}
                />
              )}

              <ul className="mt-7 grid gap-3.5">
                {card.features.map((feature) => (
                  <li key={feature} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-3">
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 text-primary"
                      strokeWidth={2.5}
                    />
                    <span className="text-sm leading-6 text-foreground/72">{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href={href}
                className={[
                  "focus-signal mt-8",
                  card.highlighted ? "button-primary" : "button-secondary",
                ].join(" ")}
              >
                {cta}
              </a>
            </article>
          );
        })}
      </div>

      <p data-reveal-item className="mt-10 text-sm leading-6 text-foreground/48">
        Cena uključuje PDV i dostavu.
      </p>
    </>
  );
}
