"use client";

// ScanMe Menu V1 — Izgled: the menu-wide display of article media (K17;
// master §7.4 LOCKED: image, an icon from the set, or nothing — never only
// "image or nothing"). It is a ceiling over each article's own choice
// (lib/menu/public-view.ts primeniPrikazMedija). `Kompaktno` is text only
// (master §7.1), so there the choice is off, with the reason in words.

import { Image as ImageIkonica, LayoutGrid, Text } from "lucide-react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuMediaMode } from "@/lib/menu/presentation";
import { IzborKartica, type KarticaIzbora } from "./kontrole";

const t = menuStudioSr.izgled.mediji;

const IKONICE = { image: ImageIkonica, icon: LayoutGrid, none: Text } as const;

export function MedijiIzbor({
  mediji,
  kompaktno,
  onIzbor,
  onemoguceno = false,
}: {
  mediji: MenuMediaMode;
  /** The layout is Kompaktno: the choice is off and says why. */
  kompaktno: boolean;
  onIzbor: (mediji: MenuMediaMode) => void;
  onemoguceno?: boolean;
}) {
  const kartice: KarticaIzbora<MenuMediaMode>[] = (["image", "icon", "none"] as const).map((vrednost) => {
    const Ikonica = IKONICE[vrednost];
    return {
      vrednost,
      naziv: t.vrednosti[vrednost],
      opis: t.opisi[vrednost],
      sadrzaj: (
        <span className="grid h-10 place-items-center rounded-[calc(var(--mp-radius-kontrola)-2px)] bg-[var(--mp-povrsina-utisana)]">
          <Ikonica strokeWidth={1.75} className="size-5 text-[var(--mp-tekst)]" />
        </span>
      ),
    };
  });
  return (
    <div className="grid gap-2" data-mediji-izbor={kompaktno ? "iskljuceno" : "ukljuceno"}>
      <IzborKartica
        oznaka={menuStudioSr.izgled.mediji.naslov}
        skrivenaOznaka
        vrednosti={kartice}
        izabrano={mediji}
        onIzbor={onIzbor}
        onemoguceno={kompaktno || onemoguceno}
        kolone="grid-cols-3"
        velicina="mala"
      />
      {kompaktno ? (
        <p data-mediji-kompaktno="" className="rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-info-meko)] px-3 py-2 text-[0.8125rem] leading-snug [--border:var(--mp-info-ivica)]">
          {t.kompaktno}
        </p>
      ) : null}
    </div>
  );
}
