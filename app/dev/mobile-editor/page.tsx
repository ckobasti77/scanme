"use client";

// Dev harness za vizuelni rad na editoru bez prijave i bez stvarnih podataka.
// Dostupan samo u development modu; mutacije u pozadini padaju jer su ID-jevi
// izmišljeni, pa nijedna izmena odavde ne može da stigne do baze.

import { notFound } from "next/navigation";
import { useSyncExternalStore } from "react";
import { EditorWorkspace } from "@/components/admin/scanme-links-editor";
import type { EditorData } from "@/components/admin/scanme-links-editor-types";
import { DEFAULT_ACCENT_TOKENS } from "@/lib/scanme-links";
import { createDefaultScanMeLinksDesignV2 } from "@/lib/scanme-links-design";

const design = createDefaultScanMeLinksDesignV2("gentle");

const fixtureDestinations = [
  {
    kind: "instagram",
    label: "Instagram",
    url: "https://instagram.com/kafeterija.proba",
  },
  {
    kind: "facebook",
    label: "Facebook",
    url: "https://facebook.com/kafeterija.proba",
  },
  {
    kind: "reservations",
    label: "Rezerviši sto",
    url: "https://rezervacije.example.com/kafeterija",
  },
  { kind: "website", label: "Naš sajt", url: "https://kafeterija-proba.rs" },
  { kind: "custom", label: "Dnevna ponuda", url: "" },
].map((destination, index) => ({
  id: `dev-destination-${index}`,
  iconKey: destination.kind,
  order: index,
  state: "active",
  publishedState: "active",
  totalClicks: 40 - index * 7,
  totalDirectVisits: 12 - index * 2,
  updatedAt: 0,
  ...destination,
}));

const fixture = {
  id: "dev-business",
  name: "Kafeterija Proba",
  clientPanelSlug: "kafeterija-proba",
  archivedAt: null,
  businessLogoUrl: null,
  profile: {
    id: "dev-profile",
    slug: "kafeterija-proba",
    status: "active",
    clientEditingEnabled: true,
    totalScans: 128,
  },
  config: {
    displayName: "Kafeterija Proba",
    description: "Specialty kafa i doručak u centru",
    logoStorageId: null,
    inheritsBusinessLogo: true,
    logoUrl: null,
    templateKey: "option-two",
    backgroundKey: "warm-ivory",
    palette: ["#8a5a44", "#d9b08c", "#f4e8dc"],
    paletteAnalysis: null,
    accent: design.colors.accent,
    accentTokens: DEFAULT_ACCENT_TOKENS,
    design,
    backgroundImageStorageId: null,
    backgroundImageUrl: null,
    backgroundVideoStorageId: null,
    backgroundVideoUrl: null,
    hasUnpublishedChanges: true,
    draftRevision: 3,
    publishedRevision: 2,
    publishedAt: null,
  },
  destinationCount: fixtureDestinations.length,
  contact: null,
  draftView: null,
  publishedView: null,
  editorRole: "admin",
  templateRegistry: [],
  destinations: fixtureDestinations,
  // EditorWorkspace koristi samo gornja polja; puni Convex tip nosi i teške
  // view strukture koje harness ne simulira, otuda cast.
} as unknown as EditorData;

const emptySubscribe = () => () => {};

export default function MobileEditorDevPage() {
  // Ljuska editora se bira po viewportu tek na klijentu; prave rute do
  // workspace-a stižu kroz client-side loader pa SSR granu nikad ne vide.
  // Harness renderuje direktno, pa mora isto da sačeka mount da se SSR HTML
  // (desktop) i klijentski izbor (mobilni) ne bi sudarili u hidrataciji.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  if (process.env.NODE_ENV === "production") notFound();
  if (!mounted) return null;
  return (
    <EditorWorkspace
      data={fixture}
      enteredThroughLegacyRoute={false}
      requestedSlug="kafeterija-proba"
    />
  );
}
