import type { EventLeadEmailDict } from "../types";

// Sajam 2026 B4 — emails that ScanMe sends to a visitor after `Zainteresovan
// sam` / `Probna vožnja` (convex/lib/fairEmails.ts). PLACEHOLDER copy: the
// final confirmation and follow-up texts are open item P1 (MASTER §19) and
// replace these strings before the lead flow goes to production. The
// follow-up body itself is the exhibitor's text (fairMessageTemplates);
// only the footer below is ScanMe's.
export const eventLeadEmailSr = {
  confirmationSubjectInterest: "Primili smo vaše interesovanje: {model}",
  confirmationSubjectTestDrive: "Primili smo vaš zahtev za probnu vožnju: {model}",
  greeting: "Zdravo, {name},",
  confirmationBodyInterest:
    "hvala na interesovanju za model {model} na događaju {event}. Vaše kontakt podatke prosleđujemo izlagaču {exhibitor}.",
  confirmationBodyTestDrive:
    "hvala na zahtevu za probnu vožnju modela {model} na događaju {event}. Ovo je zahtev, a ne zakazan termin: vaše kontakt podatke prosleđujemo izlagaču {exhibitor}, koji će vas kontaktirati radi dogovora o terminu.",
  confirmationFollowUpNote:
    "Posle sajma ćemo vam u ime izlagača poslati još jednu, poslednju poruku. Ako je ne želite, odgovorite na ovaj email i nećemo je poslati.",
  followUpFooter:
    "Ovu poruku šalje ScanMe u ime izlagača {exhibitor}, jer ste na događaju {event} ostavili kontakt za model {model}. Ovo je jedina poruka posle sajma.",
  modelLink: "Model: {url}",
  signature: "ScanMe, digitalni partner Sajma automobila",
  devTestSubject: "TEST: sajamski email sa DEV okruženja",
  devTestBody:
    "Ovo je probna poruka sa DEV okruženja ScanMe-a. Ako je vidite, slanje sajamskih emailova preko Resend-a radi.",
} as const satisfies EventLeadEmailDict;
