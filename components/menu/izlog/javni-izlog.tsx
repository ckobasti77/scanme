// ScanMe Menu V1 (K13) — the public menu in the izlog (/dev/menu-public-preview):
// the REAL renderer (JavniMeni / JavniRazdelnik) over the fixture venues of
// components/menu/fixtures/javni.ts, with no Convex and no live subscription.
// A server component: the venue's tokens are computed here, as on the real route.
//
// K21: `pozicija=sto|soba` opens the menu as a guest at a table of "Demo
// restoran" or in a room of "Hotel Primer" (Room service), `moji-zahtevi=1`
// shows "Moji zahtevi" (./gost-izlog.tsx, an in-memory venue).

import { RoomServiceNapomena } from "../gost/room-service/napomena";
import type { GostPocetno } from "../gost/gost-panel";
import type { GostKontekst } from "../gost/model";
import { fixtureKorpaSobe, fixtureKorpaStola, fixtureMojiZahtevi, IZLOG_STATUS } from "../fixtures/gost";
import { javniIzlog, javniRoomServiceIzlog } from "../fixtures/javni";
import { IZLOG_SADA } from "../fixtures/lokal";
import { JavniMeni } from "../javni/javni-meni";
import { JavniRazdelnik } from "../javni/razdelnik";
import { GostIzlog, type GostIzlogProps } from "./gost-izlog";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { orderTotals, type CartLine } from "@/lib/menu/cart";
import { REQUEST_ERROR } from "@/lib/menu/errors/requests";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { izlogHref, type PublicPreviewParams } from "@/lib/menu/izlog-params";
import { mogucnostiIzPrezentacije } from "@/lib/menu/public-view";
import type { MenuRequestChannel } from "@/lib/menu/request-status";
import { roomServicePage, roomServiceSections } from "@/lib/menu/room-service-view";

const IZLOG = "/dev/menu-public-preview";

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
  };
}

export function JavniIzlog({ params }: { params: PublicPreviewParams }) {
  if (!params.stariRenderer && (params.pozicija || params.mojiZahtevi)) {
    const gost = gostIzlogProps(params);
    if (gost) return <GostIzlog {...gost} />;
  }
  const prikaz = javniIzlog(params);
  if (prikaz.vrsta === "stari") return null;
  const izgled = javniIzgled(prikaz.presentation);
  if (prikaz.vrsta === "razdelnik") {
    return <JavniRazdelnik view={prikaz.view} izgled={izgled} naslovne={prikaz.naslovne} jezikLinkovi={prikaz.jezikLinkovi} />;
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
    />
  );
}
