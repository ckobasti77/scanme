import type { OrderingPanelDict } from "../types";

// Ordering panel — the WAITER surface at /panel/[venueCode] (RFC-004 §2.7,
// §2.10, §2.15, TASK-68). The reader is a waiter holding a cheap tablet in one
// hand, in a full room, glancing at it between two tables. Every string is a
// glance, not a sentence: one or two words on a button, one line in a badge.
//
// The stale badge is the one place in the whole product that names cause A
// (the tablet stopped reporting) — allowed here because §2.6 reserves that
// diagnostic for the panel/owner view. It must never be copied to a guest
// surface.
export const orderingPanelSr = {
  metaTitle: "Panel konobara — {name}",

  // PIN screen.
  pinHeading: "Prijava konobara",
  pinIntro: "Unesite PIN da otvorite smenu na ovom uređaju.",
  pinLabel: "PIN",
  pinSubmit: "Otvori smenu",
  pinSubmitting: "Otvaramo…",
  errorInvalidPin: "Pogrešan PIN.",
  errorLocked: "Poručivanje nije uključeno za ovaj lokal.",
  errorNotFound: "Ovaj panel ne postoji ili je uklonjen.",
  errorUnknown: "Nešto nije uspelo. Pokušajte ponovo.",
  signedOutClosed: "Smena je zatvorena. Unesite PIN za novu.",
  signedOutAdopted:
    "Smena je preuzeta na drugom uređaju. Unesite PIN da je vratite ovde.",

  // Header.
  staffLine: "Na smeni: {label}",
  staleBadge: "Tablet nije javio otkucaj — poručivanje je zaustavljeno",
  pausedBadge: "Pauzirano",
  pauseAction: "Pauziraj poručivanje",
  resumeAction: "Nastavi poručivanje",
  closeAction: "Zatvori smenu",
  closeConfirm: "Potvrdi zatvaranje",
  closeCancel: "Odustani",
  closing: "Zatvaramo…",

  // Sound (after a reload there was no PIN tap, so no gesture yet).
  soundBannerBody: "Zvuk za nove zahteve je isključen dok ne dodirnete ekran.",
  soundBannerAction: "Uključi zvuk",
  newRequestAnnouncement: "Nov zahtev — {table}",

  // Queue.
  queueHeading: "Red čekanja",
  queueEmpty: "Nema zahteva. Nov zahtev će se oglasiti.",
  kindCall: "Poziv",
  kindOrder: "Porudžbina",
  reasonLine: "Razlog: {reason}",
  noteLine: "Napomena: {note}",
  line: "{qty}× {name}",
  statusSent: "Novo",
  statusAccepted: "Prihvaćeno",
  statusEnroute: "Stiže",
  overdueBadge: "Kasni",
  acceptAction: "Prihvati",
  enrouteAction: "Stiže",
  completeAction: "Završeno",
  working: "…",
  errorInvalidTransition: "Zahtev je u međuvremenu promenjen.",
  errorRequestNotFound: "Ovaj zahtev više ne postoji.",
} as const satisfies OrderingPanelDict;
