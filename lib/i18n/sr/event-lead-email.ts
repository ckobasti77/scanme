import type { EventLeadEmailDict } from "../types";

// Sajam 2026 B4 — emails that ScanMe sends to a visitor after `Zainteresovan
// sam` / `Probna vožnja` / a survey with a contact (convex/lib/fairEmails.ts).
// The follow-up body itself is the exhibitor's text (fairMessageTemplates);
// only its footer below is ScanMe's.
// 9 Oct 2026 (Aleksa): the final visitor confirmations — "Zainteresovan sam",
// "Probna vožnja" and a survey with a contact left — word for word. {brand} =
// brand display name, {model} = model name without the brand, {exhibitor} =
// the exhibitor's legal name, {url} = the public model page / privacy page.
// The stand is never shown. Exhibitors get no automatic email.
export const eventLeadEmailSr = {
  greeting: "Zdravo {name},",
  greetingWithoutName: "Zdravo,",
  interestSubject: "Zabeležili smo vaše interesovanje za {brand} {model}",
  interestBody:
    "hvala što ste na Sajmu elektromobilnosti pogledali {brand} {model}. Vaše interesovanje smo prosledili {brand} timu. Javiće vam se sa ponudom i odgovorima na sva pitanja koja imate.",
  interestModelLink: "Model i specifikacije možete ponovo da pogledate ovde: {url}",
  testDriveSubject: "Zahtev za probnu vožnju: {brand} {model}",
  testDriveBody:
    "primili smo vaš zahtev za probnu vožnju modela {brand} {model} i prosledili ga {brand} timu. Kontaktiraće vas da zajedno dogovorite dan i vreme.",
  testDriveNote: "Za vožnju ponesite vozačku dozvolu. Uživajte!",
  surveySubject: "Hvala na odgovorima za {brand}",
  surveyBody:
    "hvala što ste odvojili minut za {brand} anketu. Vaši odgovori pomažu {brand} timu da bolje razume šta je posetiocima zaista važno.",
  surveyContactNote: "Pošto ste ostavili kontakt, {brand} tim vam može poslati ponudu za model koji vam se dopao.",
  closing: "Pozdrav,\nScanMe tim, Sajam elektromobilnosti",
  /** `{subject}` = "{brand} {model}" (survey: "{brand}"), `{exhibitor}`, `{url}` = the privacy page. */
  footer:
    "Ovu poruku ste dobili jer ste na sajmu ostavili kontakt za {subject}. Vaše podatke dobija samo {exhibitor}. Saglasnost možete povući u svakom trenutku odgovorom na ovaj mejl. Politika privatnosti: {url}",
  // A8: one follow-up per exhibitor, so {model} can be a list of models.
  followUpFooter:
    "Ovu poruku šalje ScanMe u ime izlagača {exhibitor}, jer ste na događaju {event} ostavili kontakt za: {model}. Ovo je jedina poruka posle sajma.",
  followUpFallbacks: {
    ime: "poštovani",
    izlagac: "izlagač",
    dogadjaj: "sajam",
    modeli: "naše modele",
    modeli_zainteresovan: "naše modele",
    modeli_probna_voznja: "naše modele",
    modeli_ocenjeni: "naše modele",
  },
  listAnd: "i",
  followUpSampleName: "Ime Prezime (primer)",
  modelLink: "Model: {url}",
  signature: "ScanMe, digitalni partner Sajma automobila",
  devTestSubject: "TEST: sajamski email sa DEV okruženja",
  devTestBody:
    "Ovo je probna poruka sa DEV okruženja ScanMe-a. Ako je vidite, slanje sajamskih emailova preko Resend-a radi.",
} as const satisfies EventLeadEmailDict;
