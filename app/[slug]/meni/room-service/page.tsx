// /[slug]/meni/room-service — the venue's Room service (master §5.3, §21.4): a
// separate Premium channel, not a standard page. It wears the menu's design
// and layout and shows the Room service selection, categories, order and
// prices (base → markup → manual, decided at publish; never a promotion). A
// guest whose room card opened it (K20 hop + K21) orders here; the delivery
// fee is added once per order. Anyone else reads it and is told it is ordered
// from the room. Without live Room service: an honest state and `Otvori meni`.

import { cache } from "react";
import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { JavniMeniUzivo } from "@/components/menu/javni/javni-meni-uzivo";
import { JavniOkvir } from "@/components/menu/javni/okvir";
import { RoomServiceNapomena, RoomServiceNedostupan } from "@/components/menu/gost/room-service/napomena";
import { fmt } from "@/lib/i18n/format";
import { menuGostSr } from "@/lib/i18n/sr/menu-gost";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { saJezikom } from "@/lib/menu/i18n-fallback";
import { MENU_ROOM_SERVICE_PATH } from "@/lib/menu/guest-actions";
import { mogucnostiIzPrezentacije } from "@/lib/menu/public-view";
import { roomServicePage, roomServiceSections } from "@/lib/menu/room-service-view";
import { JAVNI_ROBOTS, analitikaZa, saAkcijama } from "../_lib/prikaz";
import { gostZaStranicu, jedanParametar, ucitajGostSesiju, ucitajJavno, ulazJavno } from "../_lib/ucitaj";

export const dynamic = "force-dynamic";

const t = menuGostSr.roomService;

const ucitajRoomService = cache(async (slug: string, jezik: string | undefined) => {
  const [rs, live, slike, sesija] = await Promise.all([
    fetchQuery(api.menuPublic.roomService, { slug, ...(jezik ? { lang: jezik } : {}) }),
    fetchQuery(api.menuPublic.live, { slug }),
    fetchQuery(api.menuGuest.roomServiceMedia, { slug }),
    ucitajGostSesiju(slug),
  ]);
  if (!rs || !live) return null;
  const meni = `/${slug}/meni`;
  const put = `${meni}/${MENU_ROOM_SERVICE_PATH}`;
  return {
    view: {
      lokal: { naziv: rs.business.name, slug: rs.business.slug, logoUrl: rs.logoUrl },
      stranica: roomServicePage(t.naslov),
      stranice: [],
      sekcije: roomServiceSections(rs),
      jezik: rs.lang,
      jezici: rs.languages,
      alergeniUkljuceni: rs.allergensEnabled,
      mogucnosti: mogucnostiIzPrezentacije(rs.presentation),
    },
    izgled: javniIzgled(rs.presentation),
    slike,
    uzivo: { versionNumber: live.versionNumber, unavailableKeys: live.unavailableKeys },
    sadaMs: Date.now(),
    meni: saJezikom(meni, rs.lang, rs.languages),
    jezikLinkovi: Object.fromEntries(rs.languages.map((kod) => [kod, saJezikom(put, kod, rs.languages)])),
    dostavaRsd: rs.deliveryFeeRsd,
    gost: await gostZaStranicu(slug, rs.menuServiceId, sesija, {
      kanal: "room_service",
      pageKey: null,
      dostavaRsd: rs.deliveryFeeRsd,
    }),
    kartica: sesija?.cardId ?? null,
  };
});

async function ucitaj({ params, searchParams }: PageProps<"/[slug]/meni/room-service">) {
  const { slug } = await params;
  const jezik = jedanParametar((await searchParams).jezik);
  return { slug, jezik, rs: await ucitajRoomService(slug, jezik) };
}

export async function generateMetadata(props: PageProps<"/[slug]/meni/room-service">): Promise<Metadata> {
  const { rs } = await ucitaj(props);
  if (!rs) return { robots: JAVNI_ROBOTS };
  return {
    title: fmt(menuJavniSr.meta.naslovStranice, { stranica: t.naslov, lokal: rs.view.lokal.naziv }),
    robots: JAVNI_ROBOTS,
  };
}

export async function generateViewport(props: PageProps<"/[slug]/meni/room-service">): Promise<Viewport> {
  const { rs } = await ucitaj(props);
  return rs ? { themeColor: rs.izgled.boje.page, colorScheme: rs.izgled.ton === "tamna" ? "dark" : "light" } : {};
}

export default async function RoomServicePage(props: PageProps<"/[slug]/meni/room-service">) {
  const { slug, jezik, rs } = await ucitaj(props);
  if (rs) {
    const gost = saAkcijama(rs.gost);
    return (
      <JavniMeniUzivo
        view={rs.view}
        izgled={rs.izgled}
        slike={rs.slike}
        sadaMs={rs.sadaMs}
        uzivo={rs.uzivo}
        jezikLinkovi={rs.jezikLinkovi}
        napomena={
          <RoomServiceNapomena
            dostavaRsd={rs.dostavaRsd}
            izSobe={!gost?.kontekst.radnje.roomService}
            meniHref={rs.meni}
          />
        }
        gost={gost}
        analitika={analitikaZa(rs.view.lokal.slug, rs.view.jezik, rs.kartica)}
      />
    );
  }

  const ulaz = await ulazJavno(slug);
  if (ulaz.kind === "legacy") redirect(`/${slug}/meni`);
  if (ulaz.kind === "none") notFound();
  const meni = await ucitajJavno(slug, undefined, jezik);
  if (!meni) notFound();
  return (
    <JavniOkvir izgled={meni.izgled} lokal={meni.view.lokal} naslovStranice={t.naslov} jezik={meni.view.jezik}>
      <RoomServiceNedostupan meniHref={`/${slug}/meni`} />
    </JavniOkvir>
  );
}
