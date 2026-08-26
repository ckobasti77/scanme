import type { ConsentDict } from "../types";

// The versioned upload-consent notice (RFC-001 §2.10, TASK-17). This text sits
// ABOVE the upload control on the first screen of /m/[code] — before anything
// is sent — because uploading IS the affirmative act of consent (Art. 6(1)(a)).
//
// CONSENT_VERSION is stamped onto memoriesGuests.consentVersion inside
// memories.reserveUpload, in the same transaction as the quota slot: the act
// and its record cannot drift apart. Bump the version whenever the MEANING of
// this text changes (not for typo fixes); a bumped version simply stamps anew
// on the guest's next upload — the notice itself is always on screen.
export const CONSENT_VERSION = "2026-08-26";

export const consentSr = {
  // Inline, above the control. Short, plain, complete: who sees it, the
  // archive right, how long it is kept, and what the act of uploading means.
  inlineWho: "Sliku koju dodaš vidi domaćin, a po tvom izboru i ostali gosti.",
  inlineArchive: "Domaćin može da je uvrsti u uspomene sa ovog događaja.",
  inlineRetention:
    "Čuva se najviše {days} dana, a možeš je obrisati kad god poželiš.",
  inlineAct: "Dodavanjem slike pristaješ na ovo.",
  // The full policy — a disclosure under the notice, never a modal.
  moreLabel: "Šta ovo tačno znači?",
  fullWho:
    "Slike koje dodaš vide domaćin ovog prostora i ScanMe, koji tehnički čuva slike za domaćina.",
  fullVisibility:
    "Za svaku sliku biraš da li je vide svi gosti ili samo ti i domaćin. Izbor možeš da promeniš kad god želiš.",
  fullArchive:
    "Domaćin može sliku koju vide svi da uvrsti u javne uspomene sa događaja. Ako svoju sliku obrišeš, nestaje i odatle.",
  fullRetention:
    "Slike se automatski brišu najkasnije {days} dana od dodavanja.",
  fullDelete:
    "Svoju sliku možeš da obrišeš u bilo kom trenutku — odmah nestaje iz svih prikaza, a potom i sa servera.",
  fullCookie:
    "Da bismo znali koje slike su tvoje, tvoj telefon dobija nasumičnu oznaku u kolačiću. Ona ne otkriva ko si i ne prati te van ove stranice.",
} as const satisfies ConsentDict;
