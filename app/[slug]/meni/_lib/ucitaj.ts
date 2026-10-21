// ScanMe Menu V1 (K13, plan K12 §2.1) — the server loader of the public menu.
// Three reads in parallel, all of the PUBLISHED version only (convex/menuPublic.ts):
// the page (or the splitter), the live layer and the page images; K14 adds the
// latest EUR rate (convex/menuFx.ts), used when the venue shows the EUR switch. The clock
// is read here, not in a render (K12-12), and the venue's tokens are computed
// here, so the colour library never reaches the guest's phone (K12-4).
// cache() shares one load between generateMetadata, generateViewport and the page.
// SSR on every request, no Next data cache (plan K12-2: Cache Components is off).
//
// K21: the guest at a position. The HttpOnly guest cookies the card hop set
// (smm_g, smm_d) are verified here; the session's position and its actions
// come from Convex (menuGuest.sessionView) in the same parallel round. The raw
// tokens never leave the server: the page gets the position, the actions and
// the READ key of "Moji zahtevi" only. A plain link has no cookie, so no
// position and no actions — nothing is read from the URL or invented.

import { cache } from "react";
import { cookies } from "next/headers";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { javniIzgled, type JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { MenuKurs } from "@/lib/menu/currency";
import type { GuestActions } from "@/lib/menu/guest-actions";
import { MENU_MY_REQUESTS_PATH, MENU_ROOM_SERVICE_PATH } from "@/lib/menu/guest-actions";
import { guestTokenOf, myRequestsKeyOf } from "@/lib/menu/http/guest-actions";
import type { MenuRequestChannel } from "@/lib/menu/request-status";
import type { PublicReservationEntry } from "@/lib/menu/reservation-config";
import {
  mogucnostiIzPrezentacije,
  type JavniRazdelnikView,
  type JavnaStranicaView,
  type PublicImage,
} from "@/lib/menu/public-view";
import type { JavnoUzivo } from "@/components/menu/javni/javni-meni-uzivo";
import type { GostKontekst } from "@/components/menu/gost/model";

/** The guest at a position as the server hands it to the page (the actions are attached by the page). */
export type GostServer = { kontekst: GostKontekst; citanje: string | null };

export type JavnoUcitano =
  | {
      vrsta: "stranica";
      menuServiceId: string;
      view: JavnaStranicaView;
      izgled: JavniIzgled;
      slike: Record<string, PublicImage>;
      uzivo: JavnoUzivo;
      sadaMs: number;
      /** K14: the latest EUR rate, only when the venue shows the EUR switch; the renderer checks freshness. */
      kurs: MenuKurs | null;
      /** K21: the guest at a position; null = a plain link. */
      gost: GostServer | null;
      /** K29: the QR card of the guest's position session (the analytics "QR kartica"), or null. */
      kartica: string | null;
    }
  | {
      vrsta: "razdelnik";
      menuServiceId: string;
      view: JavniRazdelnikView;
      izgled: JavniIzgled;
      gost: GostServer | null;
    };

/** One value of a search parameter (the first, when repeated). */
export function jedanParametar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function gostKolacici() {
  const jar = await cookies();
  return {
    cookie: (name: string) => jar.get(name)?.value,
    secret: process.env.SCANME_GUEST_SECRET || null,
  };
}

export type GostSesija = {
  position: { label: string; kind: "table" | "room" | "other" };
  actions: GuestActions;
  /** K29: the card the session came from. */
  cardId?: string | null;
};

/** K21: the live guest session of this venue behind the smm_g cookie, or null. */
export const ucitajGostSesiju = cache(async (slug: string): Promise<GostSesija | null> => {
  const guestToken = await guestTokenOf(await gostKolacici(), slug);
  if (!guestToken) return null;
  return await fetchQuery(api.menuGuest.sessionView, { slug, guestToken });
});

/** K21: the read key of "Moji zahtevi" (the device's venue-scoped hash), or null without a device cookie. */
export async function ucitajCitanje(menuServiceId: string): Promise<string | null> {
  return await myRequestsKeyOf(await gostKolacici(), menuServiceId);
}

export function gostLinkovi(slug: string, actions: GuestActions, kanal: MenuRequestChannel): GostKontekst["linkovi"] {
  const meni = `/${slug}/meni`;
  return {
    meni,
    mojiZahtevi: `${meni}/${MENU_MY_REQUESTS_PATH}`,
    roomService: kanal === "standard" && actions.roomService ? `${meni}/${MENU_ROOM_SERVICE_PATH}` : null,
  };
}

/** K21: the guest context of one page, or null when there is no live position. */
export async function gostZaStranicu(
  slug: string,
  menuServiceId: string,
  sesija: GostSesija | null,
  strana: { kanal: MenuRequestChannel; pageKey: string | null; dostavaRsd: number | null },
): Promise<GostServer | null> {
  if (!sesija) return null;
  return {
    kontekst: {
      slug,
      pozicija: { naziv: sesija.position.label, vrsta: sesija.position.kind },
      radnje: sesija.actions,
      kanal: strana.kanal,
      pageKey: strana.pageKey,
      dostavaRsd: strana.dostavaRsd,
      linkovi: gostLinkovi(slug, sesija.actions, strana.kanal),
    },
    citanje: await ucitajCitanje(menuServiceId),
  };
}

export const ucitajJavno = cache(
  async (slug: string, pageSlug: string | undefined, jezik: string | undefined): Promise<JavnoUcitano | null> => {
    const args = { slug, ...(pageSlug !== undefined ? { pageSlug } : {}), ...(jezik ? { lang: jezik } : {}) };
    const [page, live, slike, poslednjiKurs, sesija] = await Promise.all([
      fetchQuery(api.menuPublic.page, args),
      fetchQuery(api.menuPublic.live, { slug }),
      fetchQuery(api.menuPublic.pageMedia, args),
      fetchQuery(api.menuFx.current, {}),
      ucitajGostSesiju(slug),
    ]);
    if (!page || !live) return null;
    // K14: the rate (one indexed read, in parallel rather than after the page) is used
    // only by a venue that shows the EUR switch.
    const kurs = page.presentation.currencyToggle ? poslednjiKurs : null;
    const izgled = javniIzgled(page.presentation);
    const lokal = { naziv: page.business.name, slug: page.business.slug, logoUrl: page.logoUrl };
    const menuServiceId = page.menuServiceId;
    if (page.kind === "splitter") {
      return {
        vrsta: "razdelnik",
        menuServiceId,
        view: { lokal, stranice: page.pages, jezik: page.lang, jezici: page.languages },
        izgled,
        gost: await gostZaStranicu(slug, menuServiceId, sesija, { kanal: "standard", pageKey: null, dostavaRsd: null }),
      };
    }
    return {
      vrsta: "stranica",
      menuServiceId,
      view: {
        lokal,
        stranica: page.page,
        stranice: page.pages,
        sekcije: page.sections,
        jezik: page.lang,
        jezici: page.languages,
        alergeniUkljuceni: page.allergensEnabled,
        mogucnosti: mogucnostiIzPrezentacije(page.presentation),
      },
      izgled,
      slike,
      uzivo: { versionNumber: live.versionNumber, unavailableKeys: live.unavailableKeys },
      sadaMs: Date.now(),
      kurs,
      gost: await gostZaStranicu(slug, menuServiceId, sesija, {
        kanal: "standard",
        pageKey: page.page.key,
        dostavaRsd: null,
      }),
      kartica: sesija?.cardId ?? null,
    };
  },
);

/** Which path serves the venue when a sub-link has no public page: new, legacy, or none. */
export const ulazJavno = cache(async (slug: string) => fetchQuery(api.menuPublic.entry, { slug }));

/**
 * K25: how the venue takes reservations (the ScanMe form, its own system, or
 * not at all). An optional extra of the menu: if the answer cannot be had, the
 * menu is served without the entry rather than not at all.
 */
export const ucitajUlazRezervacije = cache(async (slug: string): Promise<PublicReservationEntry> => {
  try {
    return await fetchQuery(api.menuReservations.publicEntry, { slug });
  } catch (error) {
    // Only the kind of failure reaches the log.
    console.error("MENU_RESERVATION_ENTRY_FAILED", error instanceof Error ? error.name : typeof error);
    return { mode: "off" };
  }
});
