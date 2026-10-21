// ScanMe Menu V1 (K26) — the shapes the reply UI is fed with (the live routes
// map the Convex answers of convex/menuMail.ts onto them; the izlog uses
// fixtures). Presentation never sees a token: only the provider, the address
// and the state of the venue's mailbox.

import type { MenuReservationStatus } from "@/lib/menu/reservation-status";
import type { ReplyKind, StoredTemplates, TemplateKind } from "@/lib/menu/reply-templates";

export type PostaProvajder = "gmail" | "microsoft";
export type IshodPoziva = "reached" | "no_answer" | "left_message";

/** The reservation as the sheet needs it (from the waiter's reservation detail). */
export type OdgovorRezervacija = {
  status: MenuReservationStatus;
  guestName: string;
  partySize: number;
  requestedAt: number;
  proposedAt: number | null;
  proposalNote: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

export type OdgovorRed = {
  id: string;
  channel: "mailbox" | "mailto" | "phone";
  kind: ReplyKind | null;
  status: "sending" | "sent" | "failed" | "logged";
  phoneOutcome: IshodPoziva | null;
  errorCode: string | null;
  createdAt: number;
  byName: string | null;
};

/** convex/menuMail.ts replyContext. */
export type OdgovorKontekst = {
  venueName: string;
  signature: string | null;
  templates: StoredTemplates;
  mailbox: {
    available: boolean;
    connection: { provider: PostaProvajder; emailAddress: string; status: "active" | "error" } | null;
  };
  replies: OdgovorRed[];
};

/** Where a send stands on this device. */
export type SlanjeStanje =
  | { stanje: "miruje" }
  | { stanje: "salje" }
  | { stanje: "poslato"; adresa: string }
  | { stanje: "greska"; code: string };

/** convex/menuMail.ts status. */
export type PostaStanje = {
  available: boolean;
  providers: PostaProvajder[];
  reason: "not_configured" | null;
  connection: {
    provider: PostaProvajder;
    emailAddress: string;
    status: "active" | "error";
    connectedAt: number;
    lastErrorCode: string | null;
  } | null;
};

/** What the OAuth callback reported back (`?posta=povezano|greska&kod=…`). */
export type PostaPovratak = { ishod: "povezano" } | { ishod: "greska"; code: string } | null;

/** convex/menuMail.ts templates. */
export type SabloniPodaci = {
  venueName: string;
  signature: string | null;
  templates: StoredTemplates;
};

export type SablonCilj = TemplateKind | "potpis";
