// Sekcija „Paketi za izlagače, AMF 2026“ ispod scene na /sajam/3d (A11, PLAN §7): četiri nivoa,
// „Kako izgleda na štandu“ u tri koraka i poziv sa kontaktom. Server komponenta, bez stanja.
// Obraća se izlagaču („Vi“), za razliku od scene koja govori posetiocu („ti“). Stavke nivoa su u
// rečniku. Redosled u DOM-u ide od najnižeg nivoa; na telefonu CSS stavlja 3D Rendgen prvi.

import { Check, Phone, Mail } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { fairAuto3dSr } from "@/lib/i18n/sr/fair-auto3d";
import type { FairAuto3dTierCopy } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import styles from "./auto3d.module.css";

const t = fairAuto3dSr.packages;
const tiers = [t.tiers.included, t.tiers.starter, t.tiers.napredni, t.tiers.rendgen] as const;
const SCENE_PATH = "/sajam/3d";
const DEMO_PART = "turbopunjac";
// Jedan demo link po koraku: tura (telefon), kiosk i deo (QR na delu). Obični `<a>`, ne next/link (A13):
// meka navigacija na istu rutu ne pravi store scene iznova, pa tura, kiosk i deo ne bi krenuli.
const stepHrefs = [`${SCENE_PATH}?tura=1`, `${SCENE_PATH}?kiosk=1`, `${SCENE_PATH}?deo=${DEMO_PART}`] as const;

function Tier({ tier, featured, index }: { tier: FairAuto3dTierCopy; featured: boolean; index: number }) {
  return (
    <li className={styles.tier} data-tier={featured ? "rendgen" : undefined} data-featured={featured ? "true" : undefined}>
      <div className={styles.tierCard} role="group" aria-labelledby={`paket-nivo-${index}`}>
        <div className={styles.tierHead}>
          {featured ? <p className={styles.tierBadge}>{t.rendgenBadge}</p> : null}
          <h3 id={`paket-nivo-${index}`} className={styles.tierName}>
            {tier.name}
          </h3>
          <p className={styles.tierPrice}>
            <strong>{tier.price}</strong>
            <span>{tier.unit}</span>
          </p>
        </div>
        <div className={styles.tierBody}>
          {tier.inherits ? <p className={styles.tierInherits}>{tier.inherits}</p> : null}
          <ul className={styles.tierItems}>
            {tier.items.map((item) => (
              <li key={item}>
                <Check aria-hidden="true" strokeWidth={2.2} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          {featured ? <p className={styles.tierNote}>{t.rendgenNote}</p> : null}
        </div>
      </div>
    </li>
  );
}

export function PackagesSection() {
  return (
    <section id="paketi" className={styles.packages} aria-labelledby="paketi-naslov">
      <header className={styles.packagesHead}>
        <p className={styles.packagesEyebrow}>{t.sectionLabel}</p>
        <h2 id="paketi-naslov">{t.title}</h2>
        <p>{t.lead}</p>
      </header>

      <ul className={styles.tiers} aria-label={t.tiersLabel}>
        {tiers.map((tier, i) => (
          <Tier key={tier.name} tier={tier} index={i} featured={tier === t.tiers.rendgen} />
        ))}
      </ul>
      <p className={styles.packagesExample}>{fairAuto3dSr.exampleNote}</p>

      <div className={styles.stand}>
        <h3>{t.standTitle}</h3>
        <ol className={styles.steps} aria-label={t.stepsLabel}>
          {t.steps.map((step, i) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepNumber}>{fmt(t.stepNumber, { index: i + 1 })}</span>
              <h4>{step.title}</h4>
              <p>{step.text}</p>
              <a href={stepHrefs[i]} className={styles.stepLink}>
                {fmt(step.link, { name: delovi.parts[DEMO_PART].name })}
              </a>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.contact}>
        <div>
          <h3>{t.contactTitle}</h3>
          <p>{t.contactText}</p>
        </div>
        <dl className={styles.contactList}>
          <div>
            <dt>{t.contactPhoneLabel}</dt>
            <dd>
              <span className={styles.contactValue}>{t.contactPhone}</span>
              <span className={styles.contactPerson}>{t.contactPerson}</span>
              <a href={t.contactPhoneHref} className={styles.contactAction} aria-label={fmt(t.contactCallAria, { phone: t.contactPhone })}>
                <Phone aria-hidden="true" strokeWidth={1.9} />
                <span>{t.contactCall}</span>
              </a>
            </dd>
          </div>
          <div>
            <dt>{t.contactEmailLabel}</dt>
            <dd>
              <span className={styles.contactValue}>{t.contactEmail}</span>
              <a href={t.contactEmailHref} className={styles.contactAction} aria-label={fmt(t.contactWriteAria, { email: t.contactEmail })}>
                <Mail aria-hidden="true" strokeWidth={1.9} />
                <span>{t.contactWrite}</span>
              </a>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
