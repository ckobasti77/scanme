"use client";

// ScanMe Menu V1 — renaming in place (K10): pages and sections. Enter saves,
// Escape cancels and gives focus back; an empty or over-long name is refused
// with the reason under the field.

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { cleanText } from "@/lib/menu/text";
import { cn } from "@/lib/utils";
import { useVracanjeFokusa } from "../lokal/zajednicko";
import { Dugme } from "../zajednicko/dugme";

export function NazivPolje({
  pocetno,
  oznaka,
  primer,
  potvrda,
  otkazi,
  maks,
  greskaPrazno,
  greskaDugo,
  radi = false,
  vratiFokusNa,
  onSacuvaj,
  onOtkazi,
  className,
}: {
  pocetno: string;
  oznaka: string;
  primer?: string;
  potvrda: string;
  otkazi: string;
  maks: number;
  greskaPrazno: string;
  greskaDugo: string;
  radi?: boolean;
  /**
   * K33: id of the element that gets focus when the field is gone (Enter, Escape, Cancel). The
   * button that opened the field is replaced by it, so the element in view when it opened no
   * longer exists; the focus would fall to the page.
   */
  vratiFokusNa?: string;
  onSacuvaj: (naziv: string) => void;
  onOtkazi: () => void;
  className?: string;
}) {
  const id = useId();
  const [naziv, setNaziv] = useState(pocetno);
  const [greska, setGreska] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useVracanjeFokusa(vratiFokusNa);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const sacuvaj = (event: FormEvent) => {
    event.preventDefault();
    const cist = cleanText(naziv);
    if (cist.length === 0) return setGreska(greskaPrazno);
    if (cist.length > maks) return setGreska(greskaDugo);
    setGreska(null);
    onSacuvaj(cist);
  };
  return (
    <form
      noValidate
      onSubmit={sacuvaj}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onOtkazi();
        }
      }}
      className={cn("grid gap-2", className)}
    >
      <label htmlFor={id} className="sr-only">
        {oznaka}
      </label>
      <input
        ref={ref}
        id={id}
        autoComplete="off"
        value={naziv}
        placeholder={primer}
        // K33: an empty name is always refused, so the field says it is required up front.
        aria-required="true"
        aria-invalid={greska ? true : undefined}
        aria-describedby={greska ? `${id}-greska` : undefined}
        onChange={(event) => setNaziv(event.target.value)}
        className="h-[var(--mp-meta)] w-full min-w-0 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] px-3 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] aria-[invalid=true]:[--border:var(--mp-opasnost)]"
      />
      {greska ? (
        <p id={`${id}-greska`} role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
      <span className="flex flex-wrap gap-2">
        <Dugme type="submit" vrsta="primarno" velicina="kompaktna" ucitava={radi}>
          {potvrda}
        </Dugme>
        <Dugme vrsta="tiho" velicina="kompaktna" onClick={onOtkazi}>
          {otkazi}
        </Dugme>
      </span>
    </form>
  );
}
