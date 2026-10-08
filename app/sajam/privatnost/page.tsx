import type { Metadata } from "next";
import Link from "next/link";
import { belgradeParts } from "@/lib/belgrade-time";
import { FAIR_PII_PURGE_AT_MS } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { fairPrivacySr as dict } from "@/lib/i18n/sr/fair-privacy";

// Sajam 2026 — the fair app's privacy page, linked from the fair footers and
// from every consent text. The retention date is the one the PII purge job
// actually runs on (FAIR_PII_PURGE_AT_MS, convex/fairRetention.ts).

export const metadata: Metadata = {
  title: dict.metaTitle,
  description: dict.metaDescription,
  robots: { index: false, follow: false },
};

const MONTHS_GENITIVE = ["januara", "februara", "marta", "aprila", "maja", "juna", "jula", "avgusta", "septembra", "oktobra", "novembra", "decembra"];

function purgeDate() {
  const { day, month, year } = belgradeParts(FAIR_PII_PURGE_AT_MS);
  return `${day}. ${MONTHS_GENITIVE[month - 1]} ${year}.`;
}

function Mail() {
  return <a href={`mailto:${dict.email}`}>{dict.email}</a>;
}

export default function FairPrivacyPage() {
  return (
    <div className="fair-event fair-privacy" data-reveal="off">
      <main className="fair-privacy__main">
        <p className="fair-privacy__brand">{dict.brand}</p>
        <h1>{dict.title}</h1>
        <p className="fair-privacy__lead">{dict.intro}</p>

        <section>
          <h2>{dict.whoTitle}</h2>
          <p>{dict.whoBody} <Mail />.</p>
        </section>

        <section>
          <h2>{dict.collectTitle}</h2>
          <ul>
            <li>{dict.collectDevice}</li>
            <li>{dict.collectScans}</li>
            <li>{dict.collectAnswers}</li>
            <li>{dict.collectContact}</li>
          </ul>
        </section>

        <section>
          <h2>{dict.whyTitle}</h2>
          <ul>
            <li>{dict.whyNoAccount}</li>
            <li>{dict.whyStats}</li>
            <li>{dict.whyContact}</li>
          </ul>
        </section>

        <section>
          <h2>{dict.contactTitle}</h2>
          <p>{dict.contactBody}</p>
        </section>

        <section>
          <h2>{dict.processorsTitle}</h2>
          <p>{dict.processorsBody}</p>
        </section>

        <section>
          <h2>{dict.retentionTitle}</h2>
          <p>{fmt(dict.retentionBody, { date: purgeDate() })}</p>
        </section>

        <section>
          <h2>{dict.rightsTitle}</h2>
          <p>{dict.rightsBody} <Mail />.</p>
          <p>{dict.complaintBody}</p>
        </section>

        <p className="fair-privacy__updated">{dict.updated}</p>
        <Link prefetch={false} href="/sajam" className="fair-privacy__back">{dict.back}</Link>
      </main>
    </div>
  );
}
