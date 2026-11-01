"use client";

// ScanMe Menu V1 (K26) — the live sheet "Obavesti gosta" of the waiter panel:
// one temporary subscription (menuMail.replyContext) while a reservation is
// open, the send from the venue's mailbox (menuMailActions.sendReply, one
// clientSendId per message: kept across a lost answer, so a retry or a double
// tap sends once, and renewed only after a definite result) and the optional
// logs (mailto opened, call outcome). The recipient is never sent from here:
// the server uses the reservation's own address.

import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { base64UrlFromBytes } from "@/lib/menu/mail/pkce";
import type { ReplyKind } from "@/lib/menu/reply-templates";
import type { IshodPoziva, OdgovorRezervacija, SlanjeStanje } from "./model";
import { ObavestiGosta } from "./obavesti-gosta";

export type ObavestiGostaRutaProps = {
  prijava: { slug: string; panelCode: string; sessionToken?: string };
  rezervacijaId: string;
  rezervacija: OdgovorRezervacija;
  offline: boolean;
};

export function ObavestiGostaRuta({ prijava, rezervacijaId, rezervacija, offline }: ObavestiGostaRutaProps) {
  const reservationId = rezervacijaId as Id<"menuReservations">;
  const kontekst = useQuery(api.menuMail.replyContext, { ...prijava, reservationId });
  const posalji = useAction(api.menuMailActions.sendReply);
  const zabelezi = useMutation(api.menuMail.logReply);
  const [slanje, setSlanje] = useState<SlanjeStanje>({ stanje: "miruje" });
  const [pozivZabelezen, setPozivZabelezen] = useState(false);
  const kljuc = useRef<string | null>(null);

  const onPosalji = async (kind: ReplyKind, subject: string, body: string) => {
    if (slanje.stanje === "salje") return;
    setSlanje({ stanje: "salje" });
    try {
      kljuc.current ??= base64UrlFromBytes(globalThis.crypto.getRandomValues(new Uint8Array(16)));
      const ishod = await posalji({ ...prijava, reservationId, kind, subject, body, clientSendId: kljuc.current });
      if (!ishod.ok || ishod.status !== "sending") kljuc.current = null;
      const adresa = kontekst?.mailbox.connection?.emailAddress ?? "";
      if (ishod.ok && ishod.status === "sent") setSlanje({ stanje: "poslato", adresa });
      else if (ishod.ok && ishod.status === "sending") setSlanje({ stanje: "salje" });
      else setSlanje({ stanje: "greska", code: ishod.ok ? "mail/send_failed" : ishod.code });
    } catch {
      setSlanje({ stanje: "greska", code: "mail/provider_unavailable" });
    }
  };

  return (
    <ObavestiGosta
      rezervacija={rezervacija}
      kontekst={kontekst}
      slanje={slanje}
      radnjeIskljucene={offline}
      onPosalji={(kind, subject, body) => void onPosalji(kind, subject, body)}
      onOtvoriEposta={(kind) => {
        void zabelezi({ ...prijava, reservationId, channel: "mailto", kind }).catch(() => undefined);
      }}
      onZabeleziPoziv={(phoneOutcome: IshodPoziva) => {
        setPozivZabelezen(false);
        void zabelezi({ ...prijava, reservationId, channel: "phone", phoneOutcome })
          .then((ishod) => setPozivZabelezen(ishod.ok))
          .catch(() => undefined);
      }}
      pozivZabelezen={pozivZabelezen}
    />
  );
}
