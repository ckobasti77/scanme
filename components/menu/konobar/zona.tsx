"use client";

// ScanMe Menu V1 (K23) — zones in the waiter panel (master §9.3 ZAKLJUČANO):
// zones are optional and shown only when the venue really has them; a waiter
// changes their OWN active zone, a manager the zones of everyone; there is no
// automatic proposal; positions without a zone ("Bez zone") are everyone's
// and always visible. The active zone is a FILTER of the queue, the floor,
// the sound and the reminder (plan K19-18), never routing: nothing is sent to
// anyone because of it.
//
// One control in the header: the current zone ("Sve zone" or its name) opens
// a small menu with every zone; managers also get "Raspodela zona", a drawer
// with every active staff member and their zone.

import { ChevronDown, Check, MapPin, Users } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { cn } from "@/lib/utils";
import { Dugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import type { KonobarClanOsoblja, KonobarSalaIshod, KonobarZona } from "./model";

const t = menuKonobarSr.zona;

export type ZonaIzborProps = {
  zones: KonobarZona[];
  /** The applied filter: null = every zone. */
  filterZoneId: string | null;
  onIzbor(zoneId: string | null): void;
  /** Offline: choosing waits (the own zone is saved on the server). */
  iskljuceno?: boolean;
  /** A manager (Owner, Manager, a panel manager): the drawer to re-assign everyone's zone. */
  raspodela?: {
    staff: KonobarClanOsoblja[];
    onPostavi(staffId: string, zoneId: string | null): Promise<KonobarSalaIshod>;
  } | null;
};

export function ZonaIzbor({ zones, filterZoneId, onIzbor, iskljuceno = false, raspodela }: ZonaIzborProps) {
  const [otvoren, setOtvoren] = useState(false);
  const [fioka, setFioka] = useState(false);
  const meniId = useId();
  const okidac = useRef<HTMLButtonElement>(null);
  const okvir = useRef<HTMLDivElement>(null);
  const redom = [...zones].sort((a, b) => a.order - b.order);
  const trenutna = filterZoneId ? (redom.find((zona) => zona.id === filterZoneId)?.name ?? t.sve) : t.sve;

  useEffect(() => {
    if (!otvoren) return;
    function naKlik(event: PointerEvent) {
      if (okvir.current && !okvir.current.contains(event.target as Node)) setOtvoren(false);
    }
    function naTaster(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOtvoren(false);
        okidac.current?.focus();
      }
    }
    document.addEventListener("pointerdown", naKlik);
    document.addEventListener("keydown", naTaster);
    return () => {
      document.removeEventListener("pointerdown", naKlik);
      document.removeEventListener("keydown", naTaster);
    };
  }, [otvoren]);

  if (redom.length === 0) return null;

  function izaberi(zoneId: string | null) {
    setOtvoren(false);
    okidac.current?.focus();
    if (zoneId !== filterZoneId) onIzbor(zoneId);
  }

  return (
    <div ref={okvir} className="relative" data-zona-izbor>
      <button
        ref={okidac}
        type="button"
        aria-expanded={otvoren}
        aria-controls={meniId}
        aria-label={fmt(t.meniCitac, { zona: trenutna })}
        onClick={() => setOtvoren((staro) => !staro)}
        className="inline-flex min-h-12 max-w-[12rem] items-center gap-1.5 rounded-full border px-3 text-base font-semibold text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] [--button-radius:999px] hover:bg-[var(--mp-povrsina-utisana)]"
      >
        <MapPin aria-hidden="true" strokeWidth={2} className="size-5 shrink-0" />
        <span aria-hidden="true" className="hidden truncate min-[480px]:inline">
          {trenutna}
        </span>
        <ChevronDown aria-hidden="true" strokeWidth={2} className="hidden size-4 shrink-0 min-[480px]:block" />
      </button>
      {otvoren ? (
        <div
          id={meniId}
          className="absolute right-0 top-[calc(100%+0.5rem)] z-40 grid w-[17rem] gap-2 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-3 shadow-[var(--mp-senka-md)]"
        >
          <p className="px-1 text-sm font-semibold text-[var(--mp-tekst-sporedni)]">{t.moja}</p>
          <div className="grid gap-1" role="group" aria-label={t.moja}>
            {[{ id: null, name: t.sve }, ...redom.map((zona) => ({ id: zona.id as string | null, name: zona.name }))].map(
              (zona) => {
                const izabrana = zona.id === filterZoneId;
                return (
                  <button
                      key={zona.id ?? "sve"}
                      type="button"
                      aria-pressed={izabrana}
                      disabled={iskljuceno}
                      onClick={() => izaberi(zona.id)}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--mp-radius-kontrola)] px-3 text-left text-base font-semibold disabled:opacity-60",
                        izabrana ? "bg-[var(--mp-akcent-meko)] text-[var(--mp-tekst)]" : "text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]",
                      )}
                    >
                      {zona.name}
                      {izabrana ? <Check aria-hidden="true" strokeWidth={2.5} className="size-5 shrink-0" /> : null}
                    </button>
                );
              },
            )}
          </div>
          <p className="px-1 text-sm text-[var(--mp-tekst-sporedni)]">{t.bezZoneUvek}</p>
          {raspodela ? (
            <Dugme
              vrsta="sekundarno"
              ikonica={Users}
              className="w-full"
              onClick={() => {
                setOtvoren(false);
                setFioka(true);
              }}
            >
              {t.raspodela}
            </Dugme>
          ) : null}
        </div>
      ) : null}
      {raspodela ? (
        <RaspodelaZona
          otvoreno={fioka}
          onOtvoreno={(sledece) => {
            setFioka(sledece);
            if (!sledece) okidac.current?.focus();
          }}
          zones={redom}
          staff={raspodela.staff}
          onPostavi={raspodela.onPostavi}
          iskljuceno={iskljuceno}
        />
      ) : null}
    </div>
  );
}

function RaspodelaZona({
  otvoreno,
  onOtvoreno,
  zones,
  staff,
  onPostavi,
  iskljuceno,
}: {
  otvoreno: boolean;
  onOtvoreno(otvoreno: boolean): void;
  zones: KonobarZona[];
  staff: KonobarClanOsoblja[];
  onPostavi(staffId: string, zoneId: string | null): Promise<KonobarSalaIshod>;
  iskljuceno: boolean;
}) {
  const [radi, setRadi] = useState<string | null>(null);
  const [poruka, setPoruka] = useState<{ tekst: string; greska: boolean } | null>(null);
  const ime = (zoneId: string | null) => (zoneId ? (zones.find((zona) => zona.id === zoneId)?.name ?? t.sve) : t.sve);

  async function promeni(clan: KonobarClanOsoblja, vrednost: string) {
    const zoneId = vrednost === "" ? null : vrednost;
    setRadi(clan.id);
    setPoruka(null);
    let ishod: KonobarSalaIshod;
    try {
      ishod = await onPostavi(clan.id, zoneId);
    } catch {
      ishod = { ok: false, code: "network" };
    }
    setRadi(null);
    setPoruka(
      ishod.ok
        ? { tekst: fmt(t.raspodelaGotovo, { ime: clan.name, zona: ime(zoneId) }), greska: false }
        : { tekst: menuKonobarSr.greska.nepoznata, greska: true },
    );
  }

  return (
    <Fioka naslov={t.raspodela} opis={t.raspodelaOpis} strana="desno" povrsina="konobar" otvoreno={otvoreno} onOtvoreno={onOtvoreno}>
      {staff.length === 0 ? (
        <p className="text-base text-[var(--mp-tekst-sporedni)]">{t.raspodelaPrazno}</p>
      ) : (
        <ul className="grid gap-4">
          {staff.map((clan) => {
            const id = `raspodela-${clan.id}`;
            return (
              <li key={clan.id} className="grid gap-1.5">
                <label htmlFor={id} className="text-base font-semibold text-[var(--mp-tekst)]">
                  {fmt(t.raspodelaOsoba, { ime: clan.name })}
                </label>
                <select
                  id={id}
                  value={clan.activeZoneId ?? ""}
                  disabled={iskljuceno || radi === clan.id}
                  onChange={(event) => void promeni(clan, event.target.value)}
                  className="min-h-12 w-full rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-povrsina)] px-3 text-base text-[var(--mp-tekst)] [--border:var(--mp-ivica-kontrole)] disabled:opacity-60"
                >
                  <option value="">{t.sve}</option>
                  {zones.map((zona) => (
                    <option key={zona.id} value={zona.id}>
                      {zona.name}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ul>
      )}
      <p
        aria-live="polite"
        role={poruka?.greska ? "alert" : undefined}
        className={cn("mt-4 min-h-6 text-[0.9375rem]", poruka?.greska ? "font-semibold text-[var(--mp-opasnost)]" : "text-[var(--mp-tekst)]")}
      >
        {poruka?.tekst ?? ""}
      </p>
    </Fioka>
  );
}

/**
 * While a zone is chosen, what waits elsewhere is never hidden in silence
 * (master §9.3: the zone is a filter the waiter chose, not a decision of the
 * system): "U drugim zonama čeka 7 zahteva · 1 kasni" and one tap back to
 * every zone.
 */
export function VanZone({ broj, kasni, onSve }: { broj: number; kasni: number; onSve(): void }) {
  if (broj <= 0) return null;
  return (
    <div
      role="status"
      data-van-zone
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--mp-radius-kontrola)] border px-4 py-2 text-[0.9375rem] text-[var(--mp-tekst)]",
        kasni > 0
          ? "[--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]"
          : "[--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]",
      )}
    >
      <MapPin aria-hidden="true" strokeWidth={2} className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 font-semibold">
        {fmt(t.vanZone[srPluralCategory(broj)], { n: broj })}
        {kasni > 0 ? ` · ${fmt(t.vanZoneKasni, { n: kasni })}` : ""}
      </span>
      <Dugme vrsta="sekundarno" onClick={onSve} className="min-h-11">
        {t.prikaziSve}
      </Dugme>
    </div>
  );
}
