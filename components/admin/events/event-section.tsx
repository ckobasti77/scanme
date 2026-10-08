"use client";

import { InterakcijeIzlagacSection, InterakcijeSection } from "@/components/admin/events/sections/interakcije-section";
import { BrisanjeSection } from "@/components/admin/events/sections/brisanje-section";
import { ImportSection } from "@/components/admin/events/sections/import-section";
import { IzlagaciSection } from "@/components/admin/events/sections/izlagaci-section";
import { IzvestajiSection } from "@/components/admin/events/sections/izvestaji-section";
import { FollowUpSection, LeadoviSection, PodesavanjaSection } from "@/components/admin/events/sections/leadovi-section";
import { ModelDetailSection, ModeliSection } from "@/components/admin/events/sections/modeli-section";
import { PoveziSection } from "@/components/admin/events/sections/povezi-section";
import { PregledSection } from "@/components/admin/events/sections/pregled-section";
import { QrDetailSection, QrSection } from "@/components/admin/events/sections/qr-section";
import { SponzorisanoSection } from "@/components/admin/events/sections/sponzorisano-section";
import type { EventSectionPath } from "@/lib/admin-v1/event-sections";

// Admin UX A2 — the section route → its container. Only the open section is
// mounted, so only its queries run.

export function AdminEventSection({ path, detailId }: { path: EventSectionPath; detailId?: string }) {
  switch (path) {
    case "pregled": return <PregledSection />;
    case "povezi": return <PoveziSection />;
    case "modeli": return detailId ? <ModelDetailSection modelId={detailId} /> : <ModeliSection />;
    case "qr": return detailId ? <QrDetailSection code={detailId} /> : <QrSection />;
    case "izlagaci": return <IzlagaciSection />;
    case "import": return <ImportSection />;
    case "interakcije": return detailId ? <InterakcijeIzlagacSection key={detailId} participationId={detailId} /> : <InterakcijeSection />;
    case "sponzorisano": return <SponzorisanoSection />;
    case "leadovi": return <LeadoviSection />;
    case "leadovi/follow-up": return <FollowUpSection />;
    case "leadovi/podesavanja": return <PodesavanjaSection />;
    case "izvestaji": return <IzvestajiSection />;
    case "brisanje": return <BrisanjeSection />;
  }
}
