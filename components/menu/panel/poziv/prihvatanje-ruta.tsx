"use client";

// ScanMe Menu V1 (K28) — the route side of the invitation page: the one query
// (convex/menuTeam.ts `inviteStatus`) and the one mutation (`acceptInvite`).
// The query never reads the clock, so "expired" is decided here, against the
// time the page opened. Signing in stays in the existing client panel; this
// route never shows a login form of its own.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { klijentskiPanelHref } from "@/lib/menu/panel-nav";
import { porukaKoda } from "../cuvanje";
import { Prihvatanje, type PozivStanje } from "./prihvatanje";

export function PrihvatanjeRuta({ slug, token }: { slug: string; token: string }) {
  const { isLoading } = useConvexAuth();
  const [pocetnoMs] = useState(() => Date.now());
  const status = useQuery(api.menuTeam.inviteStatus, isLoading ? "skip" : { token });
  const prihvati = useMutation(api.menuTeam.acceptInvite);
  const [radi, setRadi] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [panelSlug, setPanelSlug] = useState<string | null>(null);

  const prijavaHref = klijentskiPanelHref(slug);

  async function onPrihvati() {
    if (radi) return;
    setRadi(true);
    setGreska(null);
    try {
      const rezultat = await prihvati({ token });
      setPanelSlug(rezultat.slug);
    } catch (error) {
      const kod = error instanceof ConvexError && typeof error.data === "string" ? error.data : "";
      setGreska(porukaKoda(kod, menuPanelSr.poziv.greska));
    } finally {
      setRadi(false);
    }
  }

  let stanje: PozivStanje;
  if (panelSlug !== null) stanje = "prihvaceno";
  else if (status === undefined) stanje = "ucitava";
  else if (status.status === "invalid") stanje = "nevazeca";
  else if (status.expiresAt <= pocetnoMs) stanje = "istekla";
  else if (status.viewer === "anonymous") stanje = "prijava";
  else if (status.viewer === "mismatch") stanje = "drugi-nalog";
  else stanje = "vazeca";

  const pending = status !== undefined && status.status === "pending" ? status : null;

  return (
    <Prihvatanje
      stanje={stanje}
      lokal={pending?.venue}
      uloga={pending?.role}
      istice={pending?.expiresAt}
      prijavaHref={prijavaHref}
      panelHref={`/${panelSlug ?? slug}/client-panel/meni`}
      radi={radi}
      greska={greska}
      onPrihvati={onPrihvati}
    />
  );
}
