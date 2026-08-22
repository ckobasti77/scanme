"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type BillingPeriod = "monthly" | "annual";

type Plan = {
  name: string;
  description: string;
  monthly: string;
  annualPerMonth: string;
  annualTotal: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
};

const plans: Plan[] = [
  {
    name: "Start",
    description: "Za mali lokal koji tek počinje da skuplja recenzije.",
    monthly: "990",
    annualPerMonth: "825",
    annualTotal: "9.900",
    features: [
      "1 ScanMe Review nalepnica",
      "Standardni dizajn",
      "Dinamički QR kod",
      "Osnovna statistika skeniranja",
      "Email podrška",
    ],
    cta: "Zatraži ponudu",
  },
  {
    name: "Standard",
    description: "Najčešći izbor za kafiće, barove i salone.",
    monthly: "1.990",
    annualPerMonth: "1.658",
    annualTotal: "19.900",
    features: [
      "Sve iz Start paketa",
      "3 nalepnice ili 1 stalak",
      "Prilagođen dizajn",
      "NFC dodatak opciono",
      "Statistika u realnom vremenu",
      "Prioritetna podrška",
    ],
    cta: "Započni odmah",
    highlighted: true,
  },
  {
    name: "Premium",
    description: "Za više lokacija i timove kojima treba pun uvid.",
    monthly: "3.990",
    annualPerMonth: "3.325",
    annualTotal: "39.900",
    features: [
      "Sve iz Standard paketa",
      "Do 10 predmeta",
      "Napredna analitika i izvoz",
      "NFC uključen",
      "Menadžer naloga",
      "Podrška 7 dana u nedelji",
    ],
    cta: "Zatraži ponudu",
  },
];

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
    <div className="mt-9 flex justify-center">
      <div
        role="group"
        aria-label="Način naplate"
        className="relative inline-flex w-72 rounded-[1rem] border border-foreground/16 bg-card p-1"
      >
        {/* Klizni zeleni indikator; radius je pola okvira (okvir 1rem, indikator 0.5rem). */}
        <span
          aria-hidden="true"
          style={{ transform: annual ? "translateX(100%)" : "translateX(0)" }}
          className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-[0.5rem] bg-primary transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
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

export function PricingPlans() {
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const annual = period === "annual";

  return (
    <>
      <div data-reveal-group>
        <p className="accent-label text-sm font-medium">ScanMe Review paketi</p>
        <h2 className="mt-5 max-w-[14ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
          Izaberite paket po meri lokala.
        </h2>
        <p className="mt-6 max-w-[52ch] leading-7 text-foreground/62">
          Dizajn, štampa i dinamički QR su uključeni. Održavanje linka i statistiku plaćate mesečno ili godišnje, sa dva meseca gratis na godišnji plan.
        </p>
        <PeriodToggle period={period} onChange={setPeriod} />
      </div>

      <div
        data-reveal-group
        className="mt-14 grid gap-4 sm:gap-5 lg:mt-16 lg:grid-cols-3"
      >
        {plans.map((plan) => (
          <article
            key={plan.name}
            className={[
              "flex flex-col border border-foreground/14 bg-card p-7 sm:p-8",
              plan.highlighted
                ? "shadow-[0_0_0_2px_var(--primary)] lg:-my-2 lg:py-10"
                : "",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold tracking-[-0.035em]">{plan.name}</h3>
              {plan.highlighted ? (
                <span className="accent-label text-xs font-semibold">Najpopularnije</span>
              ) : null}
            </div>

            <p className="mt-3 min-h-12 text-sm leading-6 text-foreground/58">
              {plan.description}
            </p>

            <div className="mt-6 border-t border-foreground/12 pt-6" aria-live="polite">
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">
                  {annual ? plan.annualPerMonth : plan.monthly}
                </span>
                <span className="text-sm font-medium text-foreground/58">din/mes</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-foreground/48">
                {annual
                  ? `Naplaćeno ${plan.annualTotal} din godišnje`
                  : "Mesečna naplata, bez ugovorne obaveze"}
              </p>
            </div>

            <ul className="mt-7 grid gap-3.5">
              {plan.features.map((feature) => (
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
              href="#ponuda"
              className={[
                "focus-signal mt-8",
                plan.highlighted ? "button-primary" : "button-secondary",
              ].join(" ")}
            >
              {plan.cta}
            </a>
          </article>
        ))}
      </div>

      <p data-reveal-item className="mt-10 text-sm leading-6 text-foreground/48">
        Nije siguran koji paket vam odgovara? <a href="#ponuda" className="focus-signal font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-primary">Javite nam se</a> i predložićemo najbolje rešenje.
      </p>
    </>
  );
}
