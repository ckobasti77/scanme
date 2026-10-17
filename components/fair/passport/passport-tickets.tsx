"use client";

import type { FairPassportCatalogEntry, FairPassportState } from "@/lib/fair-contract";
import { fairBrandVector } from "@/lib/fair-brand-logo";
import {
  passportEventMark,
  passportTicketView,
  passportTicketsSummary,
} from "@/lib/fair-client/passport-tickets";
import { fairPassportBrandSlug, fairPassportDisplayName } from "@/lib/fair-passport";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import type { FairPassportDict } from "@/lib/i18n/types";
import { PassportTicket } from "./passport-ticket";
import { EventPostmark } from "./stamp-art";
import styles from "./passport-tickets.module.css";

// Auto Moto Fest passport overview: event postmark, summary chips and one
// ticket per brand passport (stamp passport events only; the electromobility
// fair keeps its own overview in fair-passport.tsx).

type TicketsEvent = { publicSlug: string; title: string; venueName?: string; startsAt?: number };

function cleanLabel(value: string) {
  return value.replace(/^TEST\s+/i, "").trim();
}

/** After "od": 1–4 (not 11–14) → "markice", otherwise "markica" (same rule as the stamp passport). */
function stampCount(dict: FairPassportDict, total: number) {
  return fmt(srPluralCategory(total) === "many" ? dict.stampCountMany : dict.stampCountOne, { required: total });
}

function plural(count: number, one: string, few: string, many: string) {
  const category = srPluralCategory(count);
  return fmt(category === "one" ? one : category === "few" ? few : many, { count });
}

export function PassportTickets({
  event,
  state,
  unread,
  sealShown,
  ready,
  dict,
  onSealed,
}: {
  event: TicketsEvent;
  state: FairPassportState;
  unread: Record<string, string[]>;
  /** Passports whose completion seal already landed on this device. */
  sealShown: Record<string, boolean>;
  /** The visitor's progress is loaded (no seal moment before that). */
  ready: boolean;
  dict: FairPassportDict;
  onSealed: (passportId: string) => void;
}) {
  const mark = passportEventMark(event.title, event.venueName, event.startsAt);
  const eventLabel = [mark.name, mark.year].filter(Boolean).join(" ");
  const upper = (value: string) => value.toLocaleUpperCase("sr-Latn");
  const tickets = state.catalog.map((passport: FairPassportCatalogEntry) => {
    const progress = state.progress.find((row) => row.passportId === passport.passportId);
    return { passport, view: passportTicketView(passport, progress, unread[passport.passportId] ?? []) };
  });
  const summary = passportTicketsSummary(tickets.map((ticket) => ticket.view));

  return (
    <main className={styles.main} data-loading={ready ? undefined : ""}>
      <section className={styles.top}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{eventLabel}</p>
          <h1>{dict.overviewTitle}</h1>
          <p className={styles.intro}>{dict.ticketsIntro}</p>
        </div>
        <div className={styles.postmark} role="img" aria-label={fmt(dict.ticketsPostmarkAria, { event: [eventLabel, mark.city].filter(Boolean).join(", ") })}>
          <EventPostmark top={upper(mark.name)} bottom={upper(mark.city)} year={mark.year} />
        </div>
      </section>

      {tickets.length === 0 ? (
        <section className={styles.empty}>
          <h2>{dict.emptyTitle}</h2>
          <p>{dict.emptyBody}</p>
        </section>
      ) : (
        <>
          <div className={styles.summary}>
            <span>{summary.got} <em>{stampCount(dict, summary.total)}</em></span>
            {summary.complete > 0 ? (
              <span className={styles.chipAccent}>{plural(summary.complete, dict.ticketsCompleteOne, dict.ticketsCompleteFew, dict.ticketsCompleteMany)}</span>
            ) : null}
            {summary.fresh > 0 ? (
              <span className={styles.chipAccent}>{plural(summary.fresh, dict.ticketsNewOne, dict.ticketsNewFew, dict.ticketsNewMany)}</span>
            ) : null}
          </div>
          <section className={styles.list} aria-label={dict.overviewTitle}>
            {tickets.map(({ passport, view }) => {
              const brand = cleanLabel(passport.brandName);
              const stuck = new Set(passport.models.filter((_, index) => view.cells[index] === "got").map((model) => model.eventModelId));
              const freshText = view.fresh > 0 ? `. ${plural(view.fresh, dict.ticketsNewOne, dict.ticketsNewFew, dict.ticketsNewMany)}` : "";
              const seal = !view.complete ? "none" : sealShown[passport.passportId] || !ready ? "static" : "slam";
              return (
                <PassportTicket
                  key={passport.passportId}
                  href={`/sajam/${event.publicSlug}/pasosi/${fairPassportBrandSlug(passport.brandName)}`}
                  ariaLabel={view.complete
                    ? fmt(dict.ticketAriaComplete, { brand })
                    : `${fmt(dict.ticketAria, { brand, got: view.got, count: stampCount(dict, view.total) })}${freshText}`}
                  brand={brand}
                  mark={fairBrandVector(passport.brandName)}
                  logoUrl={passport.brandLogoUrl}
                  label={fmt(dict.stampEyebrow, { event: eventLabel })}
                  models={passport.models.map((model) => ({
                    name: fairPassportDisplayName(passport.brandName, model.displayName),
                    got: stuck.has(model.eventModelId),
                  }))}
                  view={view}
                  newLabel={dict.newStamp}
                  unitLabel={srPluralCategory(view.total) === "many" ? dict.ticketStubMany : dict.ticketStubOne}
                  seal={seal}
                  sealTexts={{ top: upper(dict.umbrellaTitle), bottom: upper(mark.name), center: upper(brand), year: mark.year }}
                  onSealed={() => onSealed(passport.passportId)}
                />
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
