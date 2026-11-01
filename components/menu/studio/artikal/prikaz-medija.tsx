"use client";

// ScanMe Menu V1 — how an article shows (K15; master §7.4, §7.9): an image, an
// icon from the ScanMe set, or nothing. One main image per article: JPG, PNG
// or WebP up to 10 MB, checked here before anything is sent
// (lib/menu/image-validation.ts) and again on the server, which stores web
// versions of at most 2.400 px without metadata. The icon is the stand-in
// when the image cannot be shown, so image mode keeps one ("Rezervna
// ikonica"). The choice is saved into the draft at once; an upload makes the
// new image the article's image when it is processed.

import { ImagePlus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useId, useRef, useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { checkMenuImage, formatMegabytes, MENU_IMAGE_ACCEPT } from "@/lib/menu/image-validation";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioDetaljArtikla, StudioMedij, StudioMedijArtikla, StudioRadnje } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { JavniGlif } from "../../javni/glif";
import { MENU_PRODUCT_TYPE_GLYPHS } from "../../menu-glyph-map";
import { porukaGreske } from "../red-artikla/red-artikla";
import { IzborSegment, OZNAKA_KLASA, POLJE_KLASA, ProblemKljuca, StanjeKljuca } from "./polja";

const t = menuStudioSr.artikal;
const p = t.prikaz;

/** The icon set offered (the same map the public menu draws; "corba" is the same icon as "supa"). */
export const STUDIO_IKONICE = Object.keys(MENU_PRODUCT_TYPE_GLYPHS).filter(
  (kljuc): kljuc is keyof typeof p.ikonice => kljuc in p.ikonice,
);

type Otpremanje =
  | { faza: "miruje" }
  | { faza: "slanje"; procenat: number }
  | { faza: "obrada" }
  | { faza: "greska"; poruka: string; ponovo: File | null }
  | { faza: "gotovo"; poruka: string };

const kljucMedija = (medij: StudioMedijArtikla) => JSON.stringify(medij);

export function PrikazMedija({
  detalj,
  red,
  radnje,
  mozeUredjivanje,
  najavi,
}: {
  detalj: StudioDetaljArtikla;
  red: AutosaveRed;
  radnje: Pick<StudioRadnje, "postaviMedij" | "otpremiSliku">;
  mozeUredjivanje: boolean;
  najavi: (tekst: string) => void;
}) {
  const { artikal } = detalj;
  const id = useId();
  const ulaz = useRef<HTMLInputElement>(null);
  const kljuc = `medij:${artikal.id}`;
  const sacuvano: StudioMedijArtikla = { medij: artikal.medij, ikonica: artikal.ikonica, slikaId: detalj.slika?.id ?? null };
  const naCekanju = red.stanje(kljuc);
  const sada: StudioMedijArtikla = naCekanju && typeof naCekanju.vrednost === "string" ? JSON.parse(naCekanju.vrednost) : sacuvano;
  // "Slika" chosen before there is an image: the upload area shows, nothing is saved yet.
  const [izabranaSlika, setIzabranaSlika] = useState(false);
  const [otpremanje, setOtpremanje] = useState<Otpremanje>({ faza: "miruje" });
  const prikaz: StudioMedij = izabranaSlika && sada.slikaId === null ? "image" : sada.medij;

  const sacuvaj = (novo: StudioMedijArtikla) =>
    red.zakazi(kljuc, {
      ocekivano: kljucMedija(sacuvano),
      vrednost: kljucMedija(novo),
      posalji: (o, v) => radnje.postaviMedij(artikal.id, JSON.parse(String(o)), JSON.parse(String(v))),
    });

  const izaberiNacin = (nacin: StudioMedij) => {
    if (nacin === "image" && sada.slikaId === null) {
      setIzabranaSlika(true);
      return;
    }
    setIzabranaSlika(false);
    sacuvaj({ ...sada, medij: nacin });
  };

  const otpremi = async (fajl: File) => {
    const provera = checkMenuImage(fajl);
    if (!provera.ok) {
      const poruka = provera.problem === "too_large" ? fmt(p.greske.too_large, { mb: formatMegabytes(fajl.size) }) : p.greske[provera.problem];
      setOtpremanje({ faza: "greska", poruka, ponovo: null });
      return;
    }
    setOtpremanje({ faza: "slanje", procenat: 0 });
    const ishod = await red.prati(() =>
      radnje.otpremiSliku(artikal.id, fajl, (napredak) =>
        setOtpremanje(napredak.faza === "obrada" ? { faza: "obrada" } : { faza: "slanje", procenat: Math.round(napredak.udeo * 100) }),
      ),
    );
    if (ishod.ok) {
      setIzabranaSlika(false);
      setOtpremanje({ faza: "gotovo", poruka: p.gotovo });
      najavi(p.gotovo);
      return;
    }
    const poruka = ishod.vrsta === "greska" && !ishod.ponovljivo ? (porukaGreske(ishod.kod) ?? p.greske.neuspeh) : p.greske.neuspeh;
    setOtpremanje({ faza: "greska", poruka, ponovo: ishod.vrsta === "greska" && ishod.ponovljivo ? fajl : null });
  };

  const ukloniSliku = () => {
    setIzabranaSlika(false);
    sacuvaj({ medij: "icon", ikonica: sada.ikonica, slikaId: null });
    setOtpremanje({ faza: "gotovo", poruka: p.uklonjena });
    najavi(p.uklonjena);
  };

  const radi = otpremanje.faza === "slanje" || otpremanje.faza === "obrada";
  const slikaUrl = detalj.slika && detalj.slika.id === sada.slikaId ? detalj.slika.url : null;

  return (
    <section
      aria-labelledby={`${id}-naslov`}
      data-prikaz-medija={prikaz}
      className="grid gap-4 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)] sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-naslov`} className="text-base font-semibold">
          {p.naslov}
        </h2>
        <StanjeKljuca red={red} kljuc={kljuc} />
      </div>
      <IzborSegment<StudioMedij>
        oznaka={p.izbor}
        izabrano={prikaz}
        onIzbor={izaberiNacin}
        onemoguceno={!mozeUredjivanje || radi}
        vrednosti={[
          { vrednost: "image", tekst: p.slika },
          { vrednost: "icon", tekst: p.ikonica },
          { vrednost: "none", tekst: p.bez },
        ]}
      />
      <ProblemKljuca red={red} kljuc={kljuc} prikaz={() => p.naslov} />

      {prikaz === "image" ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start">
          <div className="relative grid aspect-[4/3] max-h-48 place-items-center sm:max-h-none overflow-hidden rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina-utisana)]">
            {slikaUrl ? (
              // A Convex-signed (or, in the izlog, a local) URL of the processed WebP; next/image would need a remote pattern per deployment.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slikaUrl} alt={fmt(p.alt, { naziv: artikal.naziv })} className="size-full object-cover" data-slika-artikla="" />
            ) : (
              <span className="grid justify-items-center gap-2 px-4 text-center text-sm text-[var(--mp-tekst-sporedni)]">
                <JavniGlif iconKey={sada.ikonica} className="size-10 text-[var(--mp-tekst-sporedni)]" />
                {sada.slikaId ? p.nemaPregleda : p.nemaSlike}
              </span>
            )}
          </div>
          <div className="grid content-start gap-3">
            <input
              ref={ulaz}
              id={`${id}-fajl`}
              type="file"
              accept={MENU_IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              disabled={!mozeUredjivanje || radi}
              onChange={(event) => {
                const fajl = event.target.files?.[0];
                event.target.value = "";
                if (fajl) void otpremi(fajl);
              }}
              data-ulaz-slike=""
            />
            <span className="flex flex-wrap gap-2">
              <Dugme
                vrsta="sekundarno"
                velicina="kompaktna"
                ikonica={sada.slikaId ? RefreshCw : ImagePlus}
                disabled={!mozeUredjivanje}
                ucitava={radi}
                onClick={() => ulaz.current?.click()}
                data-izaberi-sliku=""
              >
                {sada.slikaId ? p.zameni : p.izaberi}
              </Dugme>
              {sada.slikaId ? (
                <Dugme vrsta="tiho" velicina="kompaktna" ikonica={Trash2} disabled={!mozeUredjivanje || radi} onClick={ukloniSliku}>
                  {p.ukloni}
                </Dugme>
              ) : null}
            </span>
            <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{p.pravila}</p>
            <Napredak otpremanje={otpremanje} onPonovo={(fajl) => void otpremi(fajl)} />
            <div className="grid gap-1.5">
              <label htmlFor={`${id}-rezerva`} className={OZNAKA_KLASA}>
                {p.rezerva}
              </label>
              <select
                id={`${id}-rezerva`}
                value={sada.ikonica ?? ""}
                disabled={!mozeUredjivanje}
                aria-describedby={`${id}-rezerva-opis`}
                onChange={(event) => sacuvaj({ ...sada, ikonica: event.target.value || null })}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)] pr-8")}
              >
                <option value="">{p.podrazumevana}</option>
                {STUDIO_IKONICE.map((ikonica) => (
                  <option key={ikonica} value={ikonica}>
                    {p.ikonice[ikonica]}
                  </option>
                ))}
              </select>
              <p id={`${id}-rezerva-opis`} className="text-sm text-[var(--mp-tekst-sporedni)]">
                {p.rezervaOpis}
              </p>
            </div>
          </div>
        </div>
      ) : prikaz === "icon" ? (
        <fieldset className="grid gap-2" disabled={!mozeUredjivanje}>
          <legend className="mb-1 text-sm text-[var(--mp-tekst-sporedni)]">{p.ikonicaOpis}</legend>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2">
            {[null, ...STUDIO_IKONICE].map((ikonica) => {
              const izabrana = (sada.ikonica ?? null) === ikonica;
              return (
                <label
                  key={ikonica ?? "podrazumevana"}
                  className={cn(
                    "relative grid min-h-[4.75rem] cursor-pointer justify-items-center gap-1 rounded-[var(--mp-radius-kontrola)] border px-1 py-2 text-center text-xs font-medium leading-tight",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--mp-fokus)] has-[:disabled]:cursor-not-allowed",
                    izabrana
                      ? "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)] font-semibold"
                      : "[--border:var(--mp-ivica)] hover:bg-[var(--mp-povrsina-utisana)]",
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-ikonica`}
                    checked={izabrana}
                    onChange={() => sacuvaj({ ...sada, medij: "icon", ikonica })}
                    className="absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
                  />
                  <JavniGlif iconKey={ikonica} className="size-7 text-[var(--mp-tekst)]" />
                  <span>{ikonica ? p.ikonice[ikonica as keyof typeof p.ikonice] : p.podrazumevana}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{p.bezOpis}</p>
      )}
    </section>
  );
}

function Napredak({ otpremanje, onPonovo }: { otpremanje: Otpremanje; onPonovo: (fajl: File) => void }) {
  if (otpremanje.faza === "miruje") return <p role="status" className="sr-only" />;
  if (otpremanje.faza === "greska") {
    const { ponovo } = otpremanje;
    return (
      <div
        role="alert"
        data-greska-slike=""
        className="flex flex-wrap items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
      >
        <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-opasnost)]" />
        <p className="min-w-0 flex-1">{otpremanje.poruka}</p>
        {ponovo ? (
          <Dugme vrsta="tiho" velicina="kompaktna" onClick={() => onPonovo(ponovo)}>
            {t.pokusajPonovo}
          </Dugme>
        ) : null}
      </div>
    );
  }
  if (otpremanje.faza === "gotovo") {
    return (
      <p role="status" className="text-sm font-medium text-[var(--mp-tekst)]">
        {otpremanje.poruka}
      </p>
    );
  }
  const procenat = otpremanje.faza === "slanje" ? otpremanje.procenat : 100;
  return (
    <div role="status" className="grid gap-1.5" data-napredak-slike={otpremanje.faza}>
      <p className="text-sm font-medium">{otpremanje.faza === "slanje" ? fmt(p.salje, { procenat }) : p.obrada}</p>
      <span aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[var(--mp-povrsina-utisana)]">
        <span
          className="block h-full rounded-full bg-[var(--mp-mastilo)] transition-[width] duration-[var(--mp-trajanje-2)] motion-reduce:transition-none"
          style={{ width: `${procenat}%` }}
        />
      </span>
    </div>
  );
}
