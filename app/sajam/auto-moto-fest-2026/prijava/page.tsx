import type { Metadata } from "next";
import { ExhibitorRegistration } from "@/components/fair/exhibitor-registration";
import { getDict } from "@/lib/i18n";

const dict = getDict("fair-exhibitor-registration");

export const metadata: Metadata = { title: `${dict.title} · Auto Moto Fest 2026` };

export default function ExhibitorRegistrationPage() {
  return <div className="fair-event fair-event--auto-moto" data-reveal="off"><ExhibitorRegistration dict={dict} /></div>;
}
