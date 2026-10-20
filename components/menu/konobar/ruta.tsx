"use client";

// ScanMe Menu V1 (K22) — the live waiter panel: the ONLY place of the panel
// with Convex. Who works on this device comes from the PIN sign-in (the
// session route sets the HttpOnly cookie smk_s; the token is also handed to
// this component to carry its subscriptions) or from the Owner's/Manager's
// own account. Subscriptions are per venue, never per table (plan K19-17):
// `me`, the work queue (`activeRequests`), and the detail only while one is
// open. A sign-in that ended (12 h, logout elsewhere, PIN reset, a new panel
// link) makes `me` null and the PIN screen comes back.

import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { StaffSessionBody } from "@/lib/menu/http/staff-session";
import type { MenuRequestStatus } from "@/lib/menu/request-status";
import { useVeza } from "../gost/use-veza";
import type { KonobarIshod, KonobarRadnje, PinIshod } from "./model";
import { KonobarPanel } from "./panel";
import { PinEkran } from "./pin/pin-ekran";

export type KonobarRutaProps = {
  slug: string;
  panelCode: string;
  lokal: string;
  pinDostupan: boolean;
  /** The verified token of the smk_s cookie (null = not signed in on this device). */
  pocetniToken: string | null;
  pocetnoMs: number;
};

function sesijaPutanja(slug: string, panelCode: string) {
  return `/${slug}/konobar/${panelCode}/sesija`;
}

export function KonobarRuta({ slug, panelCode, lokal, pinDostupan, pocetniToken, pocetnoMs }: KonobarRutaProps) {
  const [token, setToken] = useState<string | null>(pocetniToken);
  const [nalogom, setNalogom] = useState(false);
  const [izabranId, setIzabranId] = useState<string | null>(null);
  const [odjavljuje, setOdjavljuje] = useState(false);
  const [bioPrijavljen, setBioPrijavljen] = useState(pocetniToken !== null);

  const prijava = token !== null ? { slug, panelCode, sessionToken: token } : nalogom ? { slug, panelCode } : null;
  const me = useQuery(api.menuWaiter.me, prijava ?? "skip");
  const nalog = useQuery(api.menuWaiter.accountEntry, prijava ? "skip" : { slug, panelCode });
  const prijavljen = prijava !== null && me !== null && me !== undefined;
  const red = useQuery(api.menuWaiter.activeRequests, prijavljen && prijava ? prijava : "skip");
  const detalj = useQuery(
    api.menuWaiter.requestDetail,
    prijavljen && prijava && izabranId ? { ...prijava, requestId: izabranId as Id<"menuRequests"> } : "skip",
  );

  const preuzmi = useMutation(api.menuWaiter.accept);
  const zavrsi = useMutation(api.menuWaiter.complete);
  const otkazi = useMutation(api.menuWaiter.cancel);
  const loginNalogom = useMutation(api.menuWaiter.loginWithAccount);
  const odjaviSesiju = useMutation(api.menuWaiter.logout);

  const naMrezi = useVeza();
  const konekcija = useConvexConnectionState();
  const veza = !naMrezi || (konekcija.hasEverConnected && !konekcija.isWebSocketConnected) ? "offline" : "online";

  async function prijaviPinom(pin: string): Promise<PinIshod> {
    let odgovor: Response;
    try {
      odgovor = await fetch(sesijaPutanja(slug, panelCode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
        credentials: "same-origin",
      });
    } catch {
      return { ok: false, stanje: { kind: "veza" } };
    }
    const telo = (await odgovor.json().catch(() => null)) as StaffSessionBody | null;
    if (!telo) return { ok: false, stanje: { kind: "veza" } };
    if (telo.ok) {
      setNalogom(false);
      setIzabranId(null);
      setToken(telo.sessionToken);
      setBioPrijavljen(true);
      return { ok: true };
    }
    switch (telo.code) {
      case "staff/wrong_pin":
        return { ok: false, stanje: { kind: "pogresan", attemptsLeft: telo.attemptsLeft ?? 0 } };
      case "staff/locked":
        return { ok: false, stanje: { kind: "blokada", lockedUntil: telo.lockedUntil ?? Date.now() } };
      case "staff/rate_limited":
        return { ok: false, stanje: { kind: "previse" } };
      case "staff/pin_unavailable":
        return { ok: false, stanje: { kind: "nedostupno" } };
      case "staff/panel_not_found":
        // The link changed meanwhile: the page answers 404 now.
        window.location.reload();
        return { ok: false, stanje: { kind: "veza" } };
      default:
        return { ok: false, stanje: { kind: "veza" } };
    }
  }

  async function udjiNalogom() {
    const ishod = await loginNalogom({ slug, panelCode });
    if (ishod.ok) {
      setToken(null);
      setNalogom(true);
    }
  }

  async function odjava() {
    if (nalogom && token === null) {
      setNalogom(false);
      setIzabranId(null);
      return;
    }
    setOdjavljuje(true);
    try {
      // The route clears the HttpOnly cookie (and ends the session when the cookie is there).
      await fetch(sesijaPutanja(slug, panelCode), { method: "DELETE", credentials: "same-origin" });
    } catch {
      // The cookie then stays until it expires; the session below still ends.
    }
    // End the server session with the token this page holds too (idempotent), so a lost cookie
    // or a failed request never leaves the sign-in alive for 12 h.
    if (token) await odjaviSesiju({ slug, panelCode, sessionToken: token }).catch(() => undefined);
    setOdjavljuje(false);
    setToken(null);
    setIzabranId(null);
    setBioPrijavljen(false);
  }

  const prijavaArgs = prijava ?? { slug, panelCode };
  const radnje: KonobarRadnje = {
    preuzmi: async (id) => (await preuzmi({ ...prijavaArgs, requestId: id as Id<"menuRequests"> })) as KonobarIshod,
    zavrsi: async (id) => (await zavrsi({ ...prijavaArgs, requestId: id as Id<"menuRequests"> })) as KonobarIshod,
    otkazi: async (id, ocekivaniStatus: MenuRequestStatus) =>
      (await otkazi({ ...prijavaArgs, requestId: id as Id<"menuRequests">, expectedStatus: ocekivaniStatus })) as KonobarIshod,
    odjava,
  };

  if (!prijavljen || !me) {
    // While a known token is being checked, keep the PIN screen calm (no "expired" flash).
    const istekla = bioPrijavljen && prijava !== null && me === null;
    return (
      <PinEkran
        lokal={lokal}
        pinDostupan={pinDostupan}
        onPrijava={prijaviPinom}
        nalog={nalog ? { ime: nalog.displayName } : null}
        onNalog={() => void udjiNalogom()}
        istekla={istekla}
        pocetnoMs={pocetnoMs}
      />
    );
  }

  return (
    <KonobarPanel
      lokal={me.businessName}
      korisnik={{ kind: me.kind, displayName: me.displayName, expiresAt: me.expiresAt }}
      red={
        red === undefined
          ? undefined
          : red === null
            ? { zahtevi: [], skraceno: false, otkazani: [] }
            : { zahtevi: red.requests, skraceno: red.truncated, otkazani: red.recentlyCancelled }
      }
      izabranId={izabranId}
      detalj={detalj}
      onIzaberi={setIzabranId}
      radnje={radnje}
      veza={veza}
      odjavljuje={odjavljuje}
      pocetnoMs={pocetnoMs}
    />
  );
}
