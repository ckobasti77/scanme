// ScanMe Menu V1 — frame of the new izlog routes (K07): a slim bar that says
// the data is invented and links the five dev routes, then the screen. The
// route keeps `?tema=` when it links to another izlog route.

import { FlaskConical } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { izlogHref, type IzlogTema } from "@/lib/menu/izlog-params";
import { MenuPovrsina, type MenuPovrsinaVrsta } from "../zajednicko/povrsina";
import { StatusOznaka } from "../zajednicko/status-oznaka";

const t = menuZajednickoSr.izlog;

export type IzlogRuta = "panel" | "editor" | "javni" | "lokal" | "konobar";

export const IZLOG_RUTE: readonly { kljuc: IzlogRuta; putanja: string }[] = [
  { kljuc: "panel", putanja: "/dev/menu-panel-preview" },
  { kljuc: "editor", putanja: "/dev/menu-editor-preview" },
  { kljuc: "javni", putanja: "/dev/menu-public-preview" },
  { kljuc: "lokal", putanja: "/dev/menu-lokal-preview" },
  { kljuc: "konobar", putanja: "/dev/menu-konobar-preview" },
];

export function IzlogOkvir({
  ruta,
  tema,
  povrsina = "panel",
  ceoEkran = false,
  children,
}: {
  ruta: IzlogRuta;
  tema: IzlogTema | null;
  povrsina?: MenuPovrsinaVrsta;
  /** The screen brings its own frame and <main> (the panel shell, K08): no wrapper, no padding. */
  ceoEkran?: boolean;
  children: ReactNode;
}) {
  return (
    <MenuPovrsina povrsina={povrsina} className={ceoEkran ? "min-h-[100dvh]" : "min-h-[100dvh] pb-24"}>
      <header className="border-b [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)]">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
          <StatusOznaka ton="info" ikonica={FlaskConical}>
            {t.oznaka}
          </StatusOznaka>
          <nav aria-label={t.sveRute}>
            <ul className="flex flex-wrap gap-1">
              {IZLOG_RUTE.map((item) => (
                <li key={item.kljuc}>
                  <Link
                    href={izlogHref(item.putanja, { tema })}
                    aria-current={item.kljuc === ruta ? "page" : undefined}
                    className="inline-flex min-h-[var(--mp-meta)] items-center rounded-[var(--mp-radius-dugme)] px-3 text-sm font-medium text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)] aria-[current=page]:bg-[var(--mp-mastilo)] aria-[current=page]:text-[var(--mp-na-mastilu)]"
                  >
                    {t.rute[item.kljuc]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      {ceoEkran ? (
        children
      ) : (
        <main className="mx-auto grid max-w-[90rem] gap-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">{children}</main>
      )}
    </MenuPovrsina>
  );
}
