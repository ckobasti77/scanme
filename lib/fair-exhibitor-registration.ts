// Fair copy for the exhibitor registration form (/sajam/[eventSlug]/prijava).
// One entry per fair: the next fair is a new entry here, not a new page.
// Pure data, no runtime imports: Convex (convex/leadEmails.ts) reads it too,
// to tag the team notification email with the right fair.

export type FairExhibitorRegistrationConfig = {
  /** URL segment and the `eventSlug`/`fair` tag stored on every inquiry. */
  slug: string;
  /** `offerSelection.source` stored on the inquiry; the email template keys on it. */
  source: string;
  /** Full fair name shown on the page and in the email heading. */
  name: string;
  /** Short tag for the email subject. */
  emailTag: string;
  /** Optional venue line next to the fair name. */
  venue?: string;
  /** Optional deadline line; omit it and the page shows none. */
  deadline?: string;
  /** "Pogledajte demo aplikacije" target. */
  demoHref: string;
  /** false: kept only so older inquiries still format; no public page. */
  open: boolean;
};

export const FAIR_EXHIBITOR_REGISTRATIONS: readonly FairExhibitorRegistrationConfig[] = [
  {
    slug: "auto-expo-2026",
    source: "auto-expo-2026-exhibitor-registration",
    name: "Auto Expo 2026",
    emailTag: "Auto Expo 2026",
    venue: "Šumadija sajam, Kragujevac",
    demoHref: "/sajam/demo-auto-moto-fest-2026",
    open: true,
  },
  {
    // Closed. /sajam/auto-moto-fest-2026/prijava redirects (308) to Auto Expo
    // in next.config.ts, so the printed QR (KZ739G7D) opens the open form.
    slug: "auto-moto-fest-2026",
    source: "amf-2026-exhibitor-registration",
    name: "Auto Moto Fest 2026",
    emailTag: "AMF 2026",
    venue: "Hala Čair, Niš",
    deadline: "Prijave do 23. oktobra u 17h",
    demoHref: "/sajam/demo-auto-moto-fest-2026",
    open: false,
  },
];

export function openFairExhibitorRegistration(slug: string) {
  return FAIR_EXHIBITOR_REGISTRATIONS.find((fair) => fair.open && fair.slug === slug) ?? null;
}

export function fairExhibitorRegistrationBySource(source: unknown) {
  return FAIR_EXHIBITOR_REGISTRATIONS.find((fair) => fair.source === source) ?? null;
}
