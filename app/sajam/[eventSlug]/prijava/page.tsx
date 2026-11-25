import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExhibitorRegistration } from "@/components/fair/exhibitor-registration";
import { FAIR_EXHIBITOR_REGISTRATIONS, openFairExhibitorRegistration } from "@/lib/fair-exhibitor-registration";
import { getDict } from "@/lib/i18n";

const dict = getDict("fair-exhibitor-registration");

// Only fairs with an open registration in lib/fair-exhibitor-registration.ts get
// a page; every other slug 404s. A closed fair's old URL is redirected in
// next.config.ts.
export const dynamicParams = false;

export function generateStaticParams() {
  return FAIR_EXHIBITOR_REGISTRATIONS.filter((fair) => fair.open).map((fair) => ({ eventSlug: fair.slug }));
}

type Props = { params: Promise<{ eventSlug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const fair = openFairExhibitorRegistration((await params).eventSlug);
  return fair ? { title: `${dict.title} · ${fair.name}` } : {};
}

export default async function ExhibitorRegistrationPage({ params }: Props) {
  const fair = openFairExhibitorRegistration((await params).eventSlug);
  if (!fair) notFound();
  return <div className="fair-event fair-event--auto-moto" data-reveal="off"><ExhibitorRegistration dict={dict} fair={fair} /></div>;
}
