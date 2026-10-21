// ScanMe Menu V1 (K25) — the two reservation pages of the public menu in the
// venue's frame: /[slug]/meni/rezervacija (the form, the venue's own system, or
// nothing) and /[slug]/meni/rezervacija/[token] (the cancel link). Server
// components: the routes pass the loads in, the izlog passes fixtures in. The
// routes reach them through app/[slug]/meni/_lib/prikaz.tsx, the one wiring
// file the JS budget test lets import the guest's folder.

import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { JavniLokal } from "@/lib/menu/public-view";
import type { PublicReservationEntry } from "@/lib/menu/reservation-config";
import { JavniOkvir } from "../../javni/okvir";
import { RezervacijaEksterni } from "./eksterni";
import { RezervacijaForma } from "./forma";
import { LinkOtkazivanja, type LinkOtkazivanjaProps } from "./link-otkazivanja";
import type { RezervacijaAkcije } from "./model";

/** The venue's frame (identity, name, language) around a reservation page. */
export type RezervacijaOkvir = {
  izgled: JavniIzgled;
  lokal: JavniLokal;
  jezik: string;
};

export function RezervacijaStrana({
  okvir,
  ulaz,
  sadaMs,
  akcije,
  meniHref,
  mojiZahteviHref,
}: {
  okvir: RezervacijaOkvir;
  /** How the venue takes reservations; the route sends "off" to a 404 before it gets here. */
  ulaz: PublicReservationEntry;
  sadaMs: number;
  akcije: RezervacijaAkcije;
  meniHref: string;
  mojiZahteviHref: string;
}) {
  return (
    <JavniOkvir izgled={okvir.izgled} lokal={okvir.lokal} naslovStranice={null} jezik={okvir.jezik}>
      {ulaz.mode === "form" ? (
        <RezervacijaForma
          slug={okvir.lokal.slug}
          kontakt={ulaz.contact}
          radnoVreme={ulaz.workingHours}
          sadaMs={sadaMs}
          akcije={akcije}
          meniHref={meniHref}
          mojiZahteviHref={mojiZahteviHref}
          satUzivo
        />
      ) : ulaz.mode === "external" ? (
        <RezervacijaEksterni lokal={okvir.lokal.naziv} url={ulaz.url} meniHref={meniHref} />
      ) : null}
    </JavniOkvir>
  );
}

export function LinkStrana({ okvir, ...link }: { okvir: RezervacijaOkvir } & LinkOtkazivanjaProps) {
  return (
    <JavniOkvir izgled={okvir.izgled} lokal={okvir.lokal} naslovStranice={null} jezik={okvir.jezik}>
      <LinkOtkazivanja {...link} />
    </JavniOkvir>
  );
}
