import type { OrderingDict } from "../types";

// Ordering — the GUEST surface at /o/[code] (RFC-004 §2.1, §2.6, §2.15,
// TASK-66). The reader is a person at a table with a drink in one hand and
// about ten seconds of patience, on a phone, in a loud room.
//
// The single most important line here is `unavailableTitle` /
// `unavailableBody`. It renders for BOTH causes of the disabled state (§2.6) —
// the tablet by the register is asleep (involuntary) and the shift is closed or
// paused (deliberate) — and it must never hint at which. The remedy is the same
// either way: catch a waiter's eye. Naming the cause reads as the venue's fault
// and earns a bad rating for a two-second fix.
export const orderingSr = {
  // Chrome.
  metaTitle: "Poručivanje — {name}",
  heading: "Poručivanje",
  intro: "Pozovite konobara ili pošaljite porudžbinu sa svog stola.",

  // The ONE disabled state, two causes, never distinguished (§2.6).
  unavailableTitle: "Poručivanje trenutno nije dostupno",
  unavailableBody:
    "Za sada nije moguće poslati porudžbinu sa telefona. Pozovite konobara rukom — odmah će vam prići.",

  // Level (a) — pozovi konobara.
  callHeading: "Pozovite konobara",
  callAction: "Pozovi konobara",
  callSending: "Šaljemo…",
  callReasonLegend: "Razlog (opciono)",
  callSent: "Poziv je poslat konobaru.",

  // Level (b) — poruči.
  orderHeading: "Poručite",
  orderEmptyItems:
    "Lokal još nije uneo stavke za poručivanje. Za sada pozovite konobara.",
  orderNoteLabel: "Napomena (opciono)",
  orderNotePlaceholder: "npr. bez leda",
  orderAction: "Pošalji porudžbinu",
  orderSending: "Šaljemo…",
  orderSent: "Porudžbina je poslata konobaru.",
  orderNothingSelected: "Izaberite bar jednu stavku.",
  itemPrice: "{price} RSD",
  qtyIncrease: "Povećaj količinu — {name}",
  qtyDecrease: "Smanji količinu — {name}",
  qtyValue: "{qty}×",
  selectedSummary: "Izabrano: {count}",

  // Refusals — the machine codes convex/orderingRequests.ts raises, in order.
  errorNotFound: "Ova stranica za poručivanje ne postoji ili je uklonjena.",
  errorInvalidGuest:
    "Vaš pristup nije prepoznat. Skenirajte karticu sa stola još jednom.",
  errorNoTable:
    "Ne možemo da prepoznamo vaš sto. Skenirajte karticu sa stola još jednom.",
  errorRateLimited: "Previše zahteva odjednom. Sačekajte malo pa pokušajte ponovo.",
  errorInvalidItems:
    "Neka od izabranih stavki više nije dostupna. Osvežite izbor i pokušajte ponovo.",
  errorInvalidReason: "Izabrani razlog više nije dostupan.",
  errorNoteTooLong: "Napomena je predugačka. Skratite je pa pošaljite ponovo.",
  errorUnknown: "Nešto nije uspelo. Pokušajte ponovo za koji trenutak.",

  // --- TASK-67: the live status (§2.6) and the deadline's action (§2.8). -----
  // Poslato → Prihvaćeno → Stiže are the guest's three words for "someone has
  // my order". They are short on purpose: they are read across a table, at a
  // glance, by someone mid-conversation.
  statusHeading: "Vaši zahtevi",
  statusKindOrder: "Porudžbina",
  statusKindCall: "Poziv konobaru",
  statusSent: "Poslato",
  statusAccepted: "Prihvaćeno",
  statusEnroute: "Stiže",
  statusCompleted: "Završeno",
  // Not "Otkazano" — the passive voice would read as though the venue cancelled
  // it, and this product never cancels anything on its own (§2.8). The guest
  // did this, and the wording says so.
  statusWithdrawn: "Otkazali ste",
  statusLine: "{qty}× {name}",
  statusReason: "Razlog: {reason}",
  statusNote: "Napomena: {note}",

  // The deadline. The middle sentence is the important one and is deliberately
  // blunt: the request has NOT been cancelled and is still waiting. Everything
  // else on this card exists to give the guest something to do (§2.8: an
  // action, not a toast).
  overdueTitle: "Još niko nije prihvatio vaš zahtev",
  overdueBody:
    "Prošlo je {minutes} min. Zahtev i dalje čeka — nije otkazan. Pozovite konobara rukom ili ga otkažite ovde.",
  withdrawAction: "Otkaži zahtev",
  withdrawing: "Otkazujemo…",
  withdrawnNotice: "Zahtev je otkazan.",
  errorRequestNotFound: "Ovaj zahtev više ne postoji.",
  errorNotWithdrawable:
    "Konobar je već prihvatio ovaj zahtev, pa više ne može da se otkaže.",
} as const satisfies OrderingDict;
