// ScanMe Menu V1 (K13) — the public menu in the izlog (/dev/menu-public-preview):
// the REAL renderer (JavniMeni / JavniRazdelnik) over the fixture venues of
// components/menu/fixtures/javni.ts, with no Convex and no live subscription.
// A server component: the venue's tokens are computed here, as on the real route.
//
// K21: `pozicija=sto|soba` opens the menu as a guest at a table of "Demo
// restoran" or in a room of "Hotel Primer" (Room service), `moji-zahtevi=1`
// shows "Moji zahtevi" (./gost-izlog.tsx, an in-memory venue).
//
// K25: reservations. The menu carries the entry card (`rezervacije=eksterni`:
// the venue's own system, `rezervacije=iskljuceno`: no card); `rezervacija=forma|
// poslato|otkazivanje|otkazano|nevazece|greska` opens one of the reservation
// pages of "Demo restoran" (working hours of fixtureRadnoVreme, contact from
// `kontakt=email|telefon|oba`), the REAL components over an in-memory venue.
// With `moji-zahtevi=1` the same parameter adds the "Rezervacije" section.

import type { ReactElement, ReactNode } from "react";
import type { ReservationLinkView } from "@/convex/menuReservations";
import { RoomServiceNapomena } from "../gost/room-service/napomena";
import type { GostPocetno } from "../gost/gost-panel";
import type { GostKontekst } from "../gost/model";
import { RezervacijaFormaIzlog } from "../gost/rezervacija/izlog";
import { IZLOG_TERMIN_REZERVACIJE, izlogRezervacije } from "../gost/rezervacija/izlog-podaci";
import { RezervacijaPoslato } from "../gost/rezervacija/poslato";
import { LinkStrana } from "../gost/rezervacija/strana";
import { UlazRezervacije } from "../gost/rezervacija/ulaz";
import { fixtureKorpaSobe, fixtureKorpaStola, fixtureMojiZahtevi, IZLOG_STATUS } from "../fixtures/gost";
import { javniIzlog, javniRoomServiceIzlog } from "../fixtures/javni";
import { IZLOG_SADA } from "../fixtures/lokal";
import { fixtureRadnoVreme, fixtureRezervacijeConfig, IZLOG_TOKEN_OTKAZIVANJA } from "../fixtures/rezervacije";
import { JavniMeni } from "../javni/javni-meni";
import { JavniOkvir } from "../javni/okvir";
import { JavniRazdelnik } from "../javni/razdelnik";
import { GostIzlog, type GostIzlogProps } from "./gost-izlog";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { orderTotals, type CartLine } from "@/lib/menu/cart";
import { REQUEST_ERROR } from "@/lib/menu/errors/requests";
import { RESERVATION_ERROR } from "@/lib/menu/errors/reservations";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { izlogHref, type JavnaRezervacijaParam, type JavniKontaktParam, type PublicPreviewParams } from "@/lib/menu/izlog-params";
import { mogucnostiIzPrezentacije } from "@/lib/menu/public-view";
import { publicReservationEntry, type PublicReservationEntry } from "@/lib/menu/reservation-config";
import type { ReservationContactMode } from "@/lib/menu/reservation-form";
import type { MenuRequestChannel } from "@/lib/menu/request-status";
import { roomServicePage, roomServiceSections } from "@/lib/menu/room-service-view";
import { belgradeDateKey, slotsFor } from "@/lib/menu/working-hours";

const IZLOG = "/dev/menu-public-preview";

const KONTAKT: Record<JavniKontaktParam, ReservationContactMode> = { email: "email", telefon: "phone", oba: "both" };

/** K25: how "Demo restoran" takes reservations in the izlog (`rezervacije=`, `kontakt=`). */
function izlogUlaz(params: PublicPreviewParams): PublicReservationEntry {
  if (params.rezervacije === "iskljuceno") return { mode: "off" };
  return publicReservationEntry(
    fixtureRezervacijeConfig({
      mode: params.rezervacije === "eksterni" ? "external" : "form",
      contact: KONTAKT[params.kontakt ?? "oba"],
    }),
  );
}

/** K25: a link to a reservation screen of the izlog (or, with null, back to the menu), keeping the venue's look. */
function rezervacijaHref(params: PublicPreviewParams, ekran: JavnaRezervacijaParam | null): string {
  return izlogHref(IZLOG, {
    primer: params.primer,
    layout: params.layout,
    mediji: params.mediji,
    paleta: params.paleta,
    tema: params.tema,
    kontakt: params.kontakt,
    rezervacije: params.rezervacije,
    rezervacija: ekran,
  });
}

/** K25: the entry card of the menu, as the real route renders it (a server component, no client JavaScript). */
function ulazRezervacije(params: PublicPreviewParams, lokal: string): ReactNode {
  return <UlazRezervacije ulaz={izlogUlaz(params)} lokal={lokal} href={rezervacijaHref(params, "forma")} />;
}

/** K25: one reservation page of the izlog, in the frame of the venue. */
function rezervacijaEkran(params: PublicPreviewParams, ekran: JavnaRezervacijaParam): ReactElement | null {
  const prikaz = javniIzlog(params);
  if (prikaz.vrsta === "stari") return null;
  const { lokal, jezik } = prikaz.view;
  const okvir = { izgled: javniIzgled(prikaz.presentation), lokal, jezik };
  const meniHref = rezervacijaHref(params, null);
  const mojiZahteviHref = izlogHref(IZLOG, { pozicija: "sto", "moji-zahtevi": "1", tema: params.tema });
  const linkHref = rezervacijaHref(params, "otkazivanje");

  if (ekran === "poslato") {
    return (
      <JavniOkvir izgled={okvir.izgled} lokal={lokal} naslovStranice={null} jezik={jezik}>
        <RezervacijaPoslato
          slug={lokal.slug}
          poslato={{
            ok: true,
            cancelToken: IZLOG_TOKEN_OTKAZIVANJA,
            reservationId: "izlog-rezervacija",
            requestedAt: IZLOG_TERMIN_REZERVACIJE,
            partySize: 4,
            deduped: false,
          }}
          sadaMs={IZLOG_SADA}
          meniHref={meniHref}
          mojiZahteviHref={mojiZahteviHref}
          putanjaLinka={linkHref}
        />
      </JavniOkvir>
    );
  }

  if (ekran === "forma" || ekran === "greska") {
    const radnoVreme = fixtureRadnoVreme();
    const prviTermin = slotsFor(belgradeDateKey(IZLOG_SADA), radnoVreme, IZLOG_SADA)[0];
    // `greska`: the venue's hours changed while the form was open, so the server refuses the term.
    const pocetno =
      ekran === "greska"
        ? {
            vrednosti: {
              ime: "Marija Gost",
              datum: belgradeDateKey(IZLOG_SADA),
              vreme: prviTermin === undefined ? "" : String(prviTermin),
              gosti: 4,
              email: "gost@example.com",
              telefon: "+381 60 000 0000",
            },
            odbijeno: {
              ok: false as const,
              code: RESERVATION_ERROR.outsideHours,
              fieldErrors: { requestedAt: "outside_hours" as const },
            },
          }
        : undefined;
    return (
      <JavniOkvir izgled={okvir.izgled} lokal={lokal} naslovStranice={null} jezik={jezik}>
        <RezervacijaFormaIzlog
          slug={lokal.slug}
          kontakt={KONTAKT[params.kontakt ?? "oba"]}
          radnoVreme={radnoVreme}
          sadaMs={IZLOG_SADA}
          meniHref={meniHref}
          mojiZahteviHref={mojiZahteviHref}
          putanjaLinka={linkHref}
          pocetno={pocetno}
        />
      </JavniOkvir>
    );
  }

  // otkazivanje | otkazano | nevazece: the page behind the cancel link.
  const pogled: ReservationLinkView | null =
    ekran === "nevazece"
      ? null
      : {
          businessName: lokal.naziv,
          status: ekran === "otkazano" ? "cancelled" : "accepted",
          requestedAt: IZLOG_TERMIN_REZERVACIJE,
          partySize: 4,
          proposedAt: null,
          proposalNote: null,
          canCancel: ekran !== "otkazano",
        };
  return (
    <LinkStrana
      okvir={okvir}
      pogled={pogled}
      sadaMs={IZLOG_SADA}
      potvrda={false}
      otkazano={ekran === "otkazano"}
      neuspelo={null}
      // The izlog has no confirmation step: cancelling leads straight to the cancelled page.
      potvrdaHref={rezervacijaHref(params, "otkazano")}
      linkHref={linkHref}
      meniHref={meniHref}
    />
  );
}

/** K21: the guest's starting state from the address (`korpa`, `zahtev`, `stanje-zahteva`, `greska`). */
function pocetnoGosta(params: PublicPreviewParams, linije: CartLine[], kanal: MenuRequestChannel, dostavaRsd: number | null): {
  pocetno: GostPocetno;
  linije: CartLine[];
} {
  const status = params.stanjeZahteva ? IZLOG_STATUS[params.stanjeZahteva] : "new";
  const sadaMs = IZLOG_SADA;
  if (params.zahtev === "poziv" || params.zahtev === "racun") {
    return {
      pocetno: {
        traka: {
          vrsta: params.zahtev === "poziv" ? "call" : "bill",
          requestId: null,
          createdAt: sadaMs,
          status,
          deduped: false,
          tudji: false,
          nacin: params.zahtev === "racun" ? "card" : null,
        },
      },
      linije: [],
    };
  }
  if (params.zahtev === "porudzbina") {
    return {
      pocetno: {
        list: "korpa",
        korpaPotvrda: { requestId: null, createdAt: sadaMs, status, totals: orderTotals(linije, kanal, dostavaRsd) },
      },
      linije: [],
    };
  }
  if (params.greska === "cena" && linije.length > 0) {
    // The guest had seen the first line 40 RSD cheaper (an older version); the server answered with
    // today's prices, which the cart already shows, and asks to confirm the new total.
    const totals = orderTotals(linije, kanal, dostavaRsd);
    return {
      pocetno: {
        list: "korpa",
        korpaGreska: {
          ok: false,
          code: REQUEST_ERROR.cartPriceChanged,
          prices: linije.map((line, index) => ({ index, pieceRsd: line.pieceRsd, lineTotalRsd: line.pieceRsd * line.quantity })),
          totals,
        },
      },
      linije,
    };
  }
  if (params.greska === "nedostupno" && linije.length > 0) {
    return {
      pocetno: { list: "korpa", korpaGreska: { ok: false, code: REQUEST_ERROR.cartUnavailable, unavailableKeys: [linije[0].articleKey] } },
      linije,
    };
  }
  if (params.greska === "limit") {
    return { pocetno: { list: "korpa", korpaGreska: { ok: false, code: REQUEST_ERROR.rateLimited } }, linije };
  }
  return { pocetno: params.korpa ? { list: "korpa" } : {}, linije: params.korpa ? linije : [] };
}

function gostIzlogProps(params: PublicPreviewParams): GostIzlogProps | null {
  const soba = params.pozicija === "soba";
  const tema = params.tema;
  const base = { pozicija: soba ? "soba" : "sto", tema };
  const linkovi = {
    meni: izlogHref(IZLOG, base),
    mojiZahtevi: izlogHref(IZLOG, { ...base, "moji-zahtevi": "1" }),
    roomService: null,
  };
  const rezim = params.mojiZahtevi ? "moji-zahtevi" : "meni";

  if (soba) {
    const rs = javniRoomServiceIzlog(params);
    const sekcije = roomServiceSections(rs.doc);
    const kontekst: GostKontekst = {
      slug: rs.lokal.slug,
      pozicija: { naziv: "Soba 204", vrsta: "room" },
      radnje: { call: false, bill: false, order: false, roomService: true },
      kanal: "room_service",
      pageKey: null,
      dostavaRsd: rs.doc.deliveryFeeRsd,
      linkovi,
    };
    const korpa = fixtureKorpaSobe(sekcije);
    const gost = pocetnoGosta(params, korpa, "room_service", rs.doc.deliveryFeeRsd);
    return {
      rezim,
      view: {
        lokal: rs.lokal,
        stranica: roomServicePage(menuGostSr.roomService.naslov),
        stranice: [],
        sekcije,
        jezik: rs.jezik,
        jezici: rs.jezici,
        alergeniUkljuceni: rs.alergeniUkljuceni,
        mogucnosti: mogucnostiIzPrezentacije(rs.presentation),
      },
      izgled: javniIzgled(rs.presentation),
      slike: rs.slike,
      sadaMs: rs.sadaMs,
      nedostupni: rs.nedostupni,
      kurs: null,
      pocetnoMeni: {},
      jezikLinkovi: {},
      pocetniDetalj: null,
      napomena: (
        <RoomServiceNapomena dostavaRsd={rs.doc.deliveryFeeRsd} izSobe={false} meniHref={izlogHref(IZLOG, { stanje: "veliki", tema })} />
      ),
      kontekst,
      pocetnoGost: gost.pocetno,
      linije: gost.linije,
      zahtevi: [],
      offline: params.offline,
    };
  }

  const prikaz = javniIzlog({ ...params, stanje: params.stanje === "razdelnik" ? null : params.stanje });
  if (prikaz.vrsta !== "stranica") return null;
  const kontekst: GostKontekst = {
    slug: prikaz.view.lokal.slug,
    pozicija: { naziv: "Sto 12", vrsta: "table" },
    radnje: { call: true, bill: true, order: true, roomService: false },
    kanal: "standard",
    pageKey: prikaz.view.stranica.key,
    dostavaRsd: null,
    linkovi,
  };
  const korpa = fixtureKorpaStola(prikaz.view.sekcije, prikaz.view.stranica.key);
  const gost = pocetnoGosta(params, korpa, "standard", null);
  return {
    rezim,
    view: prikaz.view,
    izgled: javniIzgled(prikaz.presentation),
    slike: prikaz.slike,
    sadaMs: prikaz.sadaMs,
    nedostupni: prikaz.nedostupni,
    kurs: prikaz.kurs,
    pocetnoMeni: prikaz.pocetno,
    jezikLinkovi: prikaz.jezikLinkovi,
    pocetniDetalj: prikaz.pocetniDetalj,
    napomena: null,
    kontekst,
    pocetnoGost: gost.pocetno,
    linije: gost.linije,
    zahtevi: fixtureMojiZahtevi(korpa),
    offline: params.offline,
    rezervacija: ulazRezervacije(params, prikaz.view.lokal.naziv),
    rezervacije: params.rezervacija ? izlogRezervacije() : undefined,
  };
}

export function JavniIzlog({ params }: { params: PublicPreviewParams }) {
  if (!params.stariRenderer && params.rezervacija && !params.mojiZahtevi) {
    const ekran = rezervacijaEkran(params, params.rezervacija);
    if (ekran) return ekran;
  }
  if (!params.stariRenderer && (params.pozicija || params.mojiZahtevi)) {
    const gost = gostIzlogProps(params);
    if (gost) return <GostIzlog {...gost} />;
  }
  const prikaz = javniIzlog(params);
  if (prikaz.vrsta === "stari") return null;
  const izgled = javniIzgled(prikaz.presentation);
  const ulaz = ulazRezervacije(params, prikaz.view.lokal.naziv);
  if (prikaz.vrsta === "razdelnik") {
    // The splitter of the izlog lists exactly its pages (razdelnik.test.tsx counts the links), so the
    // entry card is there only when the address asks for a reservation variant; the real route always shows it.
    const trazen = params.rezervacije === "eksterni" || params.kontakt !== null;
    return (
      <JavniRazdelnik
        view={prikaz.view}
        izgled={izgled}
        naslovne={prikaz.naslovne}
        jezikLinkovi={prikaz.jezikLinkovi}
        rezervacija={trazen ? ulaz : null}
      />
    );
  }
  return (
    <JavniMeni
      view={prikaz.view}
      izgled={izgled}
      slike={prikaz.slike}
      sadaMs={prikaz.sadaMs}
      nedostupni={prikaz.nedostupni}
      pocetniDetalj={prikaz.pocetniDetalj}
      pocetnaKategorija={prikaz.pocetnaKategorija}
      kurs={prikaz.kurs}
      pocetno={prikaz.pocetno}
      jezikLinkovi={prikaz.jezikLinkovi}
      cuvaj={false}
      rezervacija={ulaz}
    />
  );
}
