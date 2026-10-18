"use client";

// ScanMe Menu V1 — `Obriši artikal` for one article or for the selection
// (K11; master §5.6). Deleting removes a shared article from EVERY page, so
// the dialog first loads and shows the consequences per article: the pages
// that show it and the combo articles that lose it (they get "Proveri cenu"),
// plus variants and Room service. Several articles need the count typed as a
// confirmation (K09 §8 ⚑8). The deletion carries the token of exactly the
// impact shown: if anything changed meanwhile, nothing is deleted and the new
// impact is shown. It goes into the draft; guests see it after Objavi.

import { Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioBrisanjeRezultat, StudioIshod, StudioUticajArtikla, StudioUticajBrisanja } from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";
import { porukaGreske } from "../red-artikla/red-artikla";

const t = menuStudioSr;

export function UticajArtikla({ artikal }: { artikal: StudioUticajArtikla }) {
  const stranice = artikal.stranice.map((stranica) => (stranica.arhivirana ? fmt(t.brisanje.arhivirana, { naziv: stranica.naziv }) : stranica.naziv));
  return (
    <li className="grid gap-1 border-b py-2.5 last:border-b-0 [--border:var(--mp-ivica)]" data-uticaj={artikal.artikalId}>
      <p className="font-semibold [overflow-wrap:anywhere]">{artikal.naziv}</p>
      <p className="text-sm text-[var(--mp-tekst-sporedni)]">
        {stranice.length > 0 ? fmt(t.brisanje.stranice, { lista: stranice.join(", ") }) : t.brisanje.nijednaStranica}
      </p>
      {artikal.kombo.length > 0 ? (
        <p className="text-sm font-medium" data-uticaj-kombo="">
          {fmt(artikal.kombo.length === 1 ? t.brisanje.komboJedan : t.brisanje.komboVise, { lista: artikal.kombo.join(", ") })}
        </p>
      ) : artikal.vrsta === "item" ? (
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.brisanje.bezKomba}</p>
      ) : null}
      {artikal.varijante > 0 ? (
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.brisanje.varijante[srPluralCategory(artikal.varijante)], { n: artikal.varijante })}</p>
      ) : null}
      {artikal.roomService ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.brisanje.roomService}</p> : null}
    </li>
  );
}

export function BrisanjeDijalog({
  artikalIds,
  nazivJednog,
  ucitajUticaj,
  onObrisi,
  onGotovo,
  onZatvori,
}: {
  /** The articles to delete; null = closed. */
  artikalIds: readonly string[] | null;
  /** The name for the title when there is one article. */
  nazivJednog: string | null;
  ucitajUticaj: (artikalIds: readonly string[]) => Promise<StudioIshod<StudioUticajBrisanja>>;
  onObrisi: (artikalIds: readonly string[], token: string) => Promise<StudioIshod<StudioBrisanjeRezultat>>;
  onGotovo: (broj: number) => void;
  onZatvori: () => void;
}) {
  const n = artikalIds?.length ?? 0;
  const naslov =
    n === 1 && nazivJednog ? fmt(t.brisanje.naslovJedan, { naziv: nazivJednog }) : fmt(t.brisanje.naslovVise[srPluralCategory(n)], { n });
  return (
    <StudioDijalog
      otvoreno={artikalIds !== null}
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={naslov}
      opis={n === 1 ? t.brisanje.opis : t.brisanje.opisVise}
      sirina="siroka"
    >
      {artikalIds ? (
        <BrisanjeSadrzaj
          key={artikalIds.join(",")}
          artikalIds={artikalIds}
          ucitajUticaj={ucitajUticaj}
          onObrisi={onObrisi}
          onGotovo={onGotovo}
          onZatvori={onZatvori}
        />
      ) : null}
    </StudioDijalog>
  );
}

type Ucitano = { faza: "ucitava" } | { faza: "greska"; tekst: string } | { faza: "spremno"; uticaj: StudioUticajBrisanja; promenjeno: boolean };

function BrisanjeSadrzaj({
  artikalIds,
  ucitajUticaj,
  onObrisi,
  onGotovo,
  onZatvori,
}: {
  artikalIds: readonly string[];
  ucitajUticaj: (artikalIds: readonly string[]) => Promise<StudioIshod<StudioUticajBrisanja>>;
  onObrisi: (artikalIds: readonly string[], token: string) => Promise<StudioIshod<StudioBrisanjeRezultat>>;
  onGotovo: (broj: number) => void;
  onZatvori: () => void;
}) {
  const id = useId();
  const n = artikalIds.length;
  const [stanje, setStanje] = useState<Ucitano>({ faza: "ucitava" });
  const [pokusaj, setPokusaj] = useState(0);
  const [potvrda, setPotvrda] = useState("");
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const trebaKucanje = n > 1;
  const potvrdjeno = !trebaKucanje || potvrda.trim() === String(n);
  const otkaziRef = useRef<HTMLButtonElement>(null);
  const spremno = stanje.faza === "spremno";

  // The consequences load after the dialog opened on its close button: once they are
  // shown, focus moves to the safe choice (Otkaži), or to the count field.
  useEffect(() => {
    if (!spremno) return;
    const aktivan = document.activeElement;
    if (aktivan && aktivan.closest("[data-brisanje-dijalog]")) return;
    otkaziRef.current?.focus();
  }, [spremno]);

  useEffect(() => {
    let vazi = true;
    void ucitajUticaj(artikalIds).then((ishod) => {
      if (!vazi) return;
      if (!ishod.ok) {
        setStanje({ faza: "greska", tekst: ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.brisanje.greska) : t.brisanje.greska });
        return;
      }
      setStanje({ faza: "spremno", uticaj: ishod.vrednost, promenjeno: false });
    });
    return () => {
      vazi = false;
    };
  }, [artikalIds, ucitajUticaj, pokusaj]);

  if (stanje.faza === "ucitava") {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.brisanje.ucitava}</p>
        <UcitavanjeStanje oblik="lista" redova={Math.min(3, n)} />
      </div>
    );
  }
  if (stanje.faza === "greska") {
    return (
      <GreskaStanje naslov={stanje.tekst} nivo={3} onPonovo={() => setPokusaj((broj) => broj + 1)} />
    );
  }

  const { uticaj } = stanje;
  const obrisi = async () => {
    if (!potvrdjeno) {
      setGreska(fmt(t.brisanje.potvrdaGreska, { n }));
      return;
    }
    setRadi(true);
    const ishod = await onObrisi(artikalIds, uticaj.token);
    setRadi(false);
    if (!ishod.ok) {
      setGreska(ishod.vrsta === "greska" ? `${t.red.nijeSacuvano} ${porukaGreske(ishod.kod) ?? ""}`.trim() : t.red.nijeSacuvano);
      return;
    }
    if (ishod.vrednost.status === "potvrdi") {
      setStanje({ faza: "spremno", uticaj: ishod.vrednost.uticaj, promenjeno: true });
      setPotvrda("");
      return;
    }
    onGotovo(ishod.vrednost.broj);
  };

  return (
    <div className="grid gap-4" data-brisanje-dijalog="">
      {stanje.promenjeno ? (
        <p role="alert" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {t.brisanje.promenjeno}
        </p>
      ) : null}
      <ul className="grid rounded-[var(--mp-radius-kontrola)] border px-3 [--border:var(--mp-ivica)]">
        {uticaj.artikli.map((artikal) => (
          <UticajArtikla key={artikal.artikalId} artikal={artikal} />
        ))}
      </ul>
      <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.brisanje.umestoToga}</p>
      {uticaj.prevelik ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {t.brisanje.prevelik}
        </p>
      ) : null}
      {trebaKucanje ? (
        <div className="grid max-w-[18rem] gap-1.5">
          <label htmlFor={`${id}-potvrda`} className="text-sm font-medium">
            {fmt(t.brisanje.potvrdaOznaka, { n })}
          </label>
          <input
            id={`${id}-potvrda`}
            data-brisanje-potvrda=""
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={potvrda}
            aria-invalid={greska && !potvrdjeno ? true : undefined}
            onChange={(event) => {
              setPotvrda(event.target.value);
              setGreska(null);
            }}
            className="h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]"
          />
        </div>
      ) : null}
      {greska ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 flex flex-wrap items-center justify-end gap-2 border-t bg-[var(--mp-povrsina)] px-5 pb-4 pt-3 [--border:var(--mp-ivica)]">
        <Dugme vrsta="tiho" onClick={onZatvori} ref={otkaziRef}>
          {t.brisanje.otkazi}
        </Dugme>
        <Dugme
          vrsta="opasno"
          ikonica={Trash2}
          ucitava={radi}
          disabled={uticaj.prevelik || !potvrdjeno}
          onClick={obrisi}
          data-brisanje-potvrdi=""
        >
          {n === 1 ? t.brisanje.obrisiJedan : fmt(t.brisanje.obrisi[srPluralCategory(n)], { n })}
        </Dugme>
      </div>
    </div>
  );
}
