"use client";

// ScanMe Menu V1 — the editor route (K10; master §13.4: "Klik na `Editor` odmah
// otvara stvarni meni"). Mounted by /[slug]/client-panel/meni/editor inside the
// panel shell (which already checked sign-in and role). A venue whose Menu
// still mirrors an unmigrated legacy menu keeps the legacy editor (no double
// writers, K06): the route sends it there. The open page is kept in the URL
// (`?stranica=<key>`), so a reload or a shared link opens the same page.

import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { postojeciEditorHref } from "@/lib/menu/panel-nav";
import { Kartica } from "../zajednicko/kartica";
import { GreskaStanje, UcitavanjeStanje } from "../zajednicko/stanja";
import { StudioEditor } from "./studio-editor";
import { useStudioVeza } from "./veza/use-studio-veza";

const t = menuStudioSr;

export function StudioRuta({ slug, pocetnaStranica }: { slug: string; pocetnaStranica: string | null }) {
  const router = useRouter();
  const { isLoading } = useConvexAuth();
  const ulaz = useQuery(api.menuStudio.entry, isLoading ? "skip" : { slug });
  const [izabranaId, setIzabranaId] = useState<string | null>(null);
  const veza = useStudioVeza(slug, { id: izabranaId, key: pocetnaStranica });
  const stranice = veza.stanje === "spremno" ? veza.podaci.stranice : undefined;
  const izKljuca = pocetnaStranica ? (stranice?.find((s) => s.key === pocetnaStranica)?.id ?? null) : null;
  const kljucIzabrane = izabranaId ? (stranice?.find((s) => s.id === izabranaId)?.key ?? null) : null;

  useEffect(() => {
    if (ulaz?.kind === "legacy") router.replace(postojeciEditorHref(slug));
  }, [ulaz?.kind, router, slug]);

  useEffect(() => {
    if (!kljucIzabrane) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("stranica") === kljucIzabrane) return;
    url.searchParams.set("stranica", kljucIzabrane);
    window.history.replaceState(null, "", url);
  }, [kljucIzabrane]);

  if (ulaz === undefined || ulaz.kind === "legacy" || veza.stanje === "ucitava") {
    return <UcitavanjeStanje oblik="lista" redova={6} oznaka={ulaz?.kind === "legacy" ? t.stanja.stariEditor : t.stanja.ucitava} />;
  }
  if (veza.stanje === "nema") {
    return (
      <Kartica>
        <GreskaStanje naslov={t.stanja.greskaNaslov} opis={t.stanja.greskaOpis} onPonovo={() => router.refresh()} />
      </Kartica>
    );
  }
  return (
    <StudioEditor
      podaci={veza.podaci}
      radnje={veza.radnje}
      izabranaStranica={izabranaId ?? izKljuca}
      onIzaberiStranicu={setIzabranaId}
    />
  );
}
