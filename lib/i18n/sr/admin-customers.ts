import type { AdminCustomersDict } from "../types";

// Operativna tabela korisnika (components/admin/customers-admin.tsx, TASK-40,
// RFC-002 §2.6). Ovo NIJE spisak ko postoji — radna lista KOGA DA ZOVEŠ DANAS.
// Četiri statusa se IZVODE u billing modulu iz TASK-32 (deriveBillingStatus);
// ovde se samo imenuju. `{...}` se popunjava kroz fmt().
export const adminCustomersSr = {
  navLabel: "Korisnici",
  eyebrow: "Naplata i korisnici",
  title: "Svi korisnici",
  subtitle:
    "Radna lista, sortirana po sledećoj naplati. Prvo se vide oni koji su platili a ništa nisu podesili — njih zovi danas.",
  loadError: "Podaci nisu učitani.",
  empty: "Još nema korisnika.",
  count: "Korisnici ({count})",
  refreshedAt: "Osveženo u {time}",

  colName: "Naziv",
  colPhone: "Telefon",
  colServices: "Aktivne usluge",
  colPlan: "Plan",
  colPeriod: "Period",
  colStatus: "Status",
  colNextBilling: "Sledeća naplata",
  colActions: "Akcije",

  planBasic: "Basic",
  planPremium: "Premium",
  planEnterprise: "Enterprise",

  periodMonthly: "Mesečno",
  periodAnnual: "Godišnje",
  periodNone: "—",

  statusActive: "Aktivan",
  statusExpiringSoon: "Ističe za < 14 dana",
  statusExpired: "Istekao",
  statusPaidNeverConfigured: "Plaćeno ali nikad podešeno",
  statusSuspended: "Suspendovan",
  statusNoAccount: "Bez naloga",

  billingNone: "—",
  billingDueToday: "Danas",
  billingDueInDays: "za {count} dana",
  billingOverdueDays: "kasni {count} dana",

  serviceScanmeLinks: "ScanMe Links",
  serviceGoogleReview: "Google Review",
  serviceVenue: "Venue",
  serviceMemories: "Memories",
  servicesNoneActive: "nema aktivnih",
  unconfiguredNote: "Nije podešeno: {services}",

  enterpriseBadge: "Lanac",
  enterpriseLocations: "{count} lokala",
  expandAria: "Prikaži lokale — {name}",
  collapseAria: "Sakrij lokale — {name}",
  locationsHeading: "Lokali",

  openLocation: "Otvori lokal",
  openLocationAria: "Otvori lokal {name}",
  detailsAction: "Naplata i istorija",
  phoneNone: "—",
  contactNone: "Bez kontakta",

  activateService: "Aktiviraj",
  deactivateService: "Deaktiviraj",
  activateAria: "Aktiviraj {service} — {location}",
  deactivateAria: "Deaktiviraj {service} — {location}",
  activateSuccess: "{service} je aktiviran za {location}.",
  deactivateSuccess: "{service} je deaktiviran za {location}.",
  serviceToggleError: "Promena usluge nije uspela.",
  deactivateDialogTitle: "Deaktivirati {service}?",
  deactivateDialogBody:
    "Lokal gubi vlasništvo nad ovom uslugom dok je ponovo ne aktiviraš. Podaci ostaju sačuvani. Izmena se upisuje u dnevnik (ko, šta, kada).",
  deactivateConfirm: "Deaktiviraj",
  deactivateCancel: "Otkaži",

  detailHeading: "{name}",
  detailClose: "Zatvori",
  detailServicesHeading: "Usluge po lokalu",
  detailNoAccountNote:
    "Ovaj lokal još nema nalog, pa naplata nije dostupna. Nalog se pravi prvom porudžbinom.",

  paymentsHeading: "Istorija uplata",
  paymentsEmpty: "Još nema uplata.",
  paymentColDate: "Datum",
  paymentColAmount: "Iznos",
  paymentColMethod: "Način",
  paymentColCovers: "Važi do",
  paymentColReference: "Poziv na broj",
  paymentMethodManual: "Ručno",
  paymentMethodProvider: "Provajder",
  paymentVoidedTag: "Stornirano",
  paymentCoversUntil: "važi do {date}",
  lastPaymentLabel: "Poslednja uplata: {date} · {amount}",
  lastPaymentNone: "Još nema uplata",

  recordPaymentAction: "Upiši uplatu",
  paymentDialogTitle: "Nova uplata — {name}",
  paymentDialogBody:
    "Glavni tok naplate: unesi uplatu na ruke ili nalogom za prenos. Unos pomera datum sledeće naplate.",
  paymentAmountLabel: "Iznos (RSD)",
  paymentDateLabel: "Datum uplate",
  paymentReferenceLabel: "Poziv na broj / napomena",
  paymentReferenceHint: "Opciono — broj naloga za prenos ili napomena „na ruke“.",
  paymentCoversLabel: "Važi do",
  paymentCoversHint:
    "Nalog nema period naplate — unesi dokle uplata važi.",
  paymentSubmit: "Upiši uplatu",
  paymentCancel: "Otkaži",
  paymentSuccess: "Uplata je upisana. Sledeća naplata: {date}.",
  paymentSuccessNoCycle: "Uplata je upisana.",
  paymentError: "Uplata nije upisana.",

  voidAction: "Storniraj",
  voidDialogTitle: "Stornirati uplatu?",
  voidDialogBody:
    "Uplata se označava kao stornirana, ali ostaje u istoriji — ništa se ne briše. Datum sledeće naplate se ne pomera automatski; po potrebi ga ručno ispravi.",
  voidReasonLabel: "Razlog (opciono)",
  voidConfirm: "Storniraj",
  voidCancel: "Otkaži",
  voidSuccess: "Uplata je stornirana.",
  voidError: "Storniranje nije uspelo.",

  auditHeading: "Dnevnik izmena",
  auditEmpty: "Još nema izmena.",
  auditRecordPayment: "Upisana uplata",
  auditVoidPayment: "Stornirana uplata",
  auditSetNextBilling: "Promenjena sledeća naplata",
  auditActivateService: "Aktivirana usluga",
  auditDeactivateService: "Deaktivirana usluga",
  auditCreateOrder: "Napravljena porudžbina",
  auditSetPlan: "Promenjen plan",
  auditGeneric: "{action}",
} as const satisfies AdminCustomersDict;
