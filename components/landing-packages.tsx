// Landing packages section (RFC-002 §2.3, TASK-39). The landing stays
// MARKETING — no configurator, no price computed here. Three named packages
// are the fast lane: their button jumps straight into /kupovina with the
// package's services already selected and the plan on Basic (the v5 URL codec,
// lib/offer-url.ts), so a visitor who already knows what they want skips the
// decision, not the flow. Menu does not exist yet (RFC-002 §2.0 constraint 7),
// so any package containing it (Lokal, Kompletan) shows "uskoro" instead of a
// dead-end configurator that would refuse it — availability comes from
// PURCHASE_COMBOS, the same source step 1 reads, so both surfaces revive
// together the day UNAVAILABLE_SERVICES empties.
//
// Below the packages, the five services are explained by the PROBLEM they
// solve, not their product name — a visitor knows they have a party Saturday,
// not that they need "Venue". Same icon as the step-1 card and the cart
// (service-catalog.ts), so a service is recognizable across every surface.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/reveal";
import {
  PACKAGE_ICONS,
  PURCHASE_COMBOS,
  PURCHASE_SERVICE_ORDER,
  SERVICE_ICONS,
  isServiceAvailable,
} from "@/components/purchase/service-catalog";
import { encodePurchaseSelection, type PurchaseSelection } from "@/lib/offer-url";
import type { PackageId, ServiceId } from "@/lib/pricing/engine";
import { landingPackagesSr as dict } from "@/lib/i18n/sr/landing-packages";
import styles from "./landing-packages.module.css";

const PACKAGE_DISPLAY_ORDER: readonly PackageId[] = ["lokal", "dogadjaj", "kompletan"];

function packageHref(services: readonly ServiceId[]): string {
  const selection: PurchaseSelection = {
    services: services.map((service) => ({ service, period: "monthly" as const })),
    plan: "basic",
    products: [],
    step: 1,
  };
  return `/kupovina?${encodePurchaseSelection(selection).toString()}`;
}

export function LandingPackages() {
  return (
    <div className="offer-surface">
      <div data-reveal-group>
        <p className="accent-label text-sm font-medium">{dict.eyebrow}</p>
        <h2 className="mt-5 max-w-[16ch] text-4xl font-semibold leading-[0.98] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
          {dict.heading}
        </h2>
        <p className="mt-6 max-w-[52ch] leading-7 text-foreground/62">{dict.intro}</p>
      </div>

      <div data-reveal-group className="mt-14 grid gap-4 sm:gap-5 lg:mt-16 lg:grid-cols-3">
        {PACKAGE_DISPLAY_ORDER.map((id) => {
          const combo = PURCHASE_COMBOS.find((entry) => entry.id === id);
          if (!combo) return null;
          const Icon = PACKAGE_ICONS[id];
          const copy = dict.packages[id];

          return (
            <article key={id} className={`${styles.card} offer-glass offer-glass--panel`}>
              <span className={styles.icon} aria-hidden="true">
                <Icon size={22} strokeWidth={1.7} />
              </span>
              {!combo.available && <span className={styles.soonTag}>{dict.soonBadge}</span>}
              <h3 className={styles.name}>{copy.name}</h3>
              <p className={styles.sentence}>{copy.sentence}</p>
              {combo.available ? (
                <Link href={packageHref(combo.services)} className="button-primary focus-signal mt-auto">
                  {copy.cta}
                  <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
                </Link>
              ) : (
                <p className={styles.soonNote}>{dict.soonNote}</p>
              )}
            </article>
          );
        })}
      </div>

      <Reveal className="mt-10 flex flex-wrap items-center gap-4">
        <p className="font-medium tracking-[-0.02em]">{dict.buildOwnLabel}</p>
        <Link href="/kupovina" className="button-secondary focus-signal">
          {dict.buildOwnCta}
          <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.7} />
        </Link>
      </Reveal>

      <div data-reveal-group className="mt-20 lg:mt-24">
        <h3 className="max-w-[24ch] text-2xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-3xl">
          {dict.servicesHeading}
        </h3>
        <p className="mt-4 max-w-[52ch] leading-7 text-foreground/62">{dict.servicesIntro}</p>

        <div className="mt-9 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          {PURCHASE_SERVICE_ORDER.map((service) => {
            const Icon = SERVICE_ICONS[service];
            const copy = dict.services[service];
            const soon = !isServiceAvailable(service);

            return (
              <article key={service} className={`${styles.serviceCard} offer-glass offer-glass--panel`}>
                <div className={styles.serviceHead}>
                  <span className={styles.icon} aria-hidden="true">
                    <Icon size={20} strokeWidth={1.7} />
                  </span>
                  {soon && <span className={styles.soonTag}>{dict.soonBadge}</span>}
                </div>
                <h4 className={styles.serviceName}>{copy.name}</h4>
                <p className={styles.serviceProblem}>{copy.problem}</p>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
