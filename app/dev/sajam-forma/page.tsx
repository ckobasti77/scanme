import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FairEventShell } from "@/components/fair/event-shell";
import { FAIR_EMPTY_LEAD_DRAFT, type FairLeadDraft, type FairLeadSheetKind } from "@/components/fair/lead-form-model";
import type { FairLeadStatus } from "@/components/fair/lead-form";
import type { FairOpenLeadForm } from "@/components/fair/model-view";
import type { FairContactRequirement } from "@/lib/fair-contract";
import { fairModelSr as dict } from "@/lib/i18n/sr/fair-model";
import { FairLeadFormPreview, type FairLeadPreviewState } from "./form-preview";
import "../../sajam/fair-event.css";

// N6 — DEV preview of the `Zainteresovan sam` / `Probna vožnja` form states
// (TEST data, no Convex, no request). Never in production.
//   ?vrsta=interes|probna
//   ?stanje=prazno|saglasnost|odbijam|greska|mreza|ogranicenje|cekanje|uspeh|duplikat
//   ?kontakt=one_of|email|phone|both  ?zeli=email|phone  ?ceo=1 (cela forma u toku strane)

export const metadata: Metadata = {
  title: dict.leadPreviewTitle,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const scalar = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// TEST fixture data only (DEV rehearsal names, never a real exhibitor or text).
const TEST_MODEL = "TEST Volta X1 TEST Premium";
const TEST_EXHIBITOR = "TEST Izlagač A";
const TEST_CONSENT =
  "TEST saglasnost: ScanMe prima vaše ime i kontakt i prosleđuje ih samo izlagaču TEST Izlagač A, koji će vas kontaktirati povodom ovog zahteva. Podaci se trajno brišu 16. 11. 2026.";
const FILLED: FairLeadDraft = { values: { contactName: "TEST Posetilac", email: "posetilac@example.invalid", phone: "064 000 0000" }, consent: "accept" };

function requirement(value: string | undefined, kind: FairLeadSheetKind): FairContactRequirement {
  if (value === "one_of" || value === "email" || value === "phone" || value === "both") return value;
  return kind === "testDrive" ? "both" : "one_of";
}

function previewState(query: SearchParams): FairLeadPreviewState {
  const kind: FairLeadSheetKind = scalar(query.vrsta) === "probna" ? "testDrive" : "interest";
  const preferred = scalar(query.zeli);
  const form: FairOpenLeadForm = {
    eventModelId: "test-preview-model",
    kind: kind === "testDrive" ? "test_drive" : "interest",
    state: "open",
    contactRequirement: requirement(scalar(query.kontakt), kind),
    ...(preferred === "email" || preferred === "phone" ? { preferredContact: preferred } : {}),
    consent: { version: 1, text: TEST_CONSENT },
  };
  const base = { kind, form, reply: { kind: "success", duplicate: false, confirmationEmail: true } as const };
  const idle: FairLeadStatus = { kind: "idle" };
  switch (scalar(query.stanje)) {
    case "saglasnost":
      return { ...base, draft: FILLED, status: idle };
    case "odbijam":
      return { ...base, draft: { ...FILLED, consent: "decline" }, status: idle };
    case "greska":
      return {
        ...base,
        draft: { values: { contactName: "Marko www.primer.rs", email: "marko@primer", phone: "64 123 4567" }, consent: "accept" },
        status: idle,
        fieldErrors: { contactName: "link", email: "format", phone: "format" },
      };
    case "mreza":
      return { ...base, draft: FILLED, status: { kind: "error", outcome: { kind: "failed" } } };
    case "ogranicenje":
      return { ...base, draft: FILLED, status: { kind: "error", outcome: { kind: "rate_limited", retryAfterSeconds: 42 } } };
    case "cekanje":
      return { ...base, draft: FILLED, status: { kind: "submitting" } };
    case "uspeh":
      return { ...base, draft: FAIR_EMPTY_LEAD_DRAFT, status: { kind: "success", duplicate: false, confirmationTo: "posetilac@example.invalid" } };
    case "duplikat":
      return { ...base, draft: FAIR_EMPTY_LEAD_DRAFT, status: { kind: "success", duplicate: true, confirmationTo: null } };
    default:
      return { ...base, draft: FAIR_EMPTY_LEAD_DRAFT, status: idle };
  }
}

export default async function FairLeadFormPreviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const query = await searchParams;
  const preview = previewState(query);
  const fullHeight = scalar(query.ceo) === "1";
  return (
    <div className="fair-event fair-model-page" data-reveal="off">
      <FairEventShell eventId="test-preview-event" eventSlug="test-elektromobilnost-2026" eventTitle={dict.eventUmbrellaTitle} eventName={dict.leadPreviewTitle} dict={dict} />
      {fullHeight ? null : <main className="fair-model-main" />}
      <FairLeadFormPreview preview={preview} dict={dict} modelName={TEST_MODEL} exhibitorName={TEST_EXHIBITOR} fullHeight={fullHeight} />
    </div>
  );
}
