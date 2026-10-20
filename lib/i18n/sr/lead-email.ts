// Mejl timu ScanMe za svaki prihvaćen upit sa javnog landinga (convex/leadEmails.ts).
// Interni mejl (ide na SCANME_ACTIVATION_REQUEST_EMAIL ili office@scanme.rs);
// posetilac ga ne vidi. Co-located kao landing-packages.ts: jedna površina,
// direktan uvoz; `satisfies` čini ključ koji nedostaje greškom kompajliranja.

export interface LeadEmailDict {
  /** {business} = naziv biznisa iz upita. */
  subject: string;
  heading: string;
  intro: string;
  replyHint: string;
  notProvided: string;
  logoAttached: string;
  /** {time} = vreme upita po Beogradu. */
  timeValue: string;
  fields: {
    contactName: string;
    businessName: string;
    businessType: string;
    city: string;
    email: string;
    phone: string;
    interest: string;
    message: string;
    offerSelection: string;
    amfSummary: string;
    amfVehicles: string;
    amfVehicleColNumber: string;
    amfVehicleColModel: string;
    amfVehicleColPackage: string;
    amfVehicleColPrice: string;
    logo: string;
    time: string;
    leadId: string;
  };
  amf: {
    subject: string;
    heading: string;
    intro: string;
    summaryValue: string;
    starterLabel: string;
    starterPrice: string;
    advancedLabel: string;
    advancedPrice: string;
    vehicleLine: string;
  };
  interests: {
    review: string;
    page: string;
    venue: string;
    memories: string;
    loyalty: string;
    not_sure: string;
  };
  failure: {
    notConfigured: string;
    /** {status} = HTTP status koji je Resend vratio. */
    providerStatus: string;
    unknown: string;
  };
}

export const leadEmailSr = {
  subject: "Novi upit sa scanme.rs — {business}",
  heading: "Novi upit sa scanme.rs",
  intro: "Posetilac je poslao upit kroz kontakt formu na sajtu.",
  replyHint: "Odgovor na ovaj mejl ide direktno posetiocu.",
  notProvided: "Nije navedeno",
  logoAttached: "Priložen (Convex storage)",
  timeValue: "{time} (Europe/Belgrade)",
  fields: {
    contactName: "Ime i prezime",
    businessName: "Biznis",
    businessType: "Tip biznisa",
    city: "Grad",
    email: "Imejl",
    phone: "Telefon",
    interest: "Zanima me",
    message: "Poruka",
    offerSelection: "Izbor iz ponude",
    amfSummary: "Pregled paketa",
    amfVehicles: "Prijavljena vozila",
    amfVehicleColNumber: "#",
    amfVehicleColModel: "Marka i model",
    amfVehicleColPackage: "Paket",
    amfVehicleColPrice: "Cena",
    logo: "Logo",
    time: "Vreme",
    leadId: "ID upita",
  },
  amf: {
    subject: "Prijava izlagača · AMF 2026 — {business} ({count})",
    heading: "Prijava izlagača — Auto Moto Fest 2026",
    intro: "Izlagač je poslao prijavu vozila i paketa kroz obrazac za Auto Moto Fest 2026.",
    summaryValue: "Ukupno vozila: {total} (Napredni: {advanced} · Starter: {starter})",
    starterLabel: "Starter",
    starterPrice: "3.000 RSD",
    advancedLabel: "Napredni",
    advancedPrice: "5.000 RSD",
    vehicleLine: "{number}. {model} — {package} ({price})",
  },
  interests: {
    review: "ScanMe Review",
    page: "ScanMe Page",
    venue: "ScanMe Venue",
    memories: "ScanMe Memories",
    loyalty: "ScanMe Loyalty",
    not_sure: "Druga usluga ili nije siguran/na (vidi poruku)",
  },
  failure: {
    notConfigured: "RESEND_API_KEY ili RESEND_FROM_EMAIL nije podešen.",
    providerStatus: "Resend je vratio HTTP {status}.",
    unknown: "Slanje mejla nije uspelo.",
  },
} as const satisfies LeadEmailDict;

