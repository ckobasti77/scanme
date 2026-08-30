import type { PrivacyDict } from "../types";

// TASK-20 STEP 5 — the Memories privacy policy (/m/[code]/privatnost), linked
// from the consent notice. This is PRODUCT COPY drafted in plain Serbian, not
// legal advice: it explains, in words a guest can read, the same posture the
// RFC records (§2.10). It needs a lawyer's review before launch. Ti-form to
// match the rest of the guest surface. `{...}` placeholders go through fmt().
export const privacySr = {
  metaTitle: "Privatnost · {name}",
  title: "Kako čuvamo tvoje slike",
  intro:
    "Slike koje dodaješ pripadaju događaju i njegovom domaćinu. Domaćin odlučuje šta se s njima dešava (on je „rukovalac“ podacima), a ScanMe ih tehnički čuva i obrađuje za domaćina (kao „obrađivač“).",
  lawfulHeading: "Na osnovu čega obrađujemo podatke",
  photosHeading: "Tvoje slike",
  photosBody:
    "Sliku dodaješ svojom voljom — sam čin dodavanja je tvoj pristanak (osnov: saglasnost). Ništa se ne šalje dok ti ne dodaš sliku.",
  visibilityBody:
    "Za svaku sliku biraš da li je vide svi gosti ili samo ti i domaćin, kad god to prostor dozvoljava. Taj izbor je deo tvoje saglasnosti i možeš da ga promeniš.",
  archiveBody:
    "Sliku koju vide svi domaćin može da uvrsti u javne uspomene sa događaja. Ako je obrišeš, nestaje i odatle.",
  cookieHeading: "Kolačić na tvom telefonu",
  cookieBody:
    "Da bismo znali koje su slike tvoje i da ti pokažemo tvoja mesta, tvoj telefon dobija nasumičnu oznaku u kolačiću. Ona ne otkriva ko si, ne prati te van ove stranice i neophodna je za samu uslugu — zato za nju nema posebnog pitanja.",
  analyticsHeading: "Skeniranja kartica",
  analyticsBody:
    "Kada se kartica skenira, beležimo samo da se to dogodilo i vrstu uređaja (telefon, tablet, računar). Ne čuvamo tvoju IP adresu niti bilo šta po čemu bismo te prepoznali (osnov: legitimni interes, uz najmanji mogući obim podataka).",
  retentionHeading: "Koliko se slike čuvaju",
  retentionBody:
    "Slike ovog prostora čuvaju se najviše {days} dana od dodavanja, a zatim se automatski i trajno brišu — i sama slika i sve njene verzije sa servera.",
  retentionTiers:
    "U zavisnosti od plana događaja, taj rok je 30, 90 ili 365 dana.",
  deleteHeading: "Kako da obrišeš svoje slike",
  deleteBody:
    "Svaku sliku možeš da obrišeš pojedinačno, ili sve odjednom preko „Obriši sve moje slike“ na stranici „Moje slike“. Slika odmah nestaje iz svih prikaza, a zatim se briše i sa servera, uključujući uspomene događaja ako je bila tamo.",
  deleteKeyNote:
    "Pošto nemamo tvoje ime ni imejl, tvoje slike prepoznajemo isključivo po oznaci na tvom telefonu — zato njome upravljaš samo ti, sa svog uređaja.",
  controllerHeading: "Ko je odgovoran",
  controllerBody:
    "Domaćin događaja je rukovalac tvojim slikama i odlučuje o njima. ScanMe je obrađivač — čuva i obrađuje slike po uputstvima domaćina i po ovim pravilima. Za pitanja o svojim podacima obrati se domaćinu događaja.",
  updatedLabel: "Verzija obaveštenja: {version}",
  backLink: "Nazad",
} as const satisfies PrivacyDict;
