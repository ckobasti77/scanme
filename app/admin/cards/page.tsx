import type { Metadata } from "next";
import { CardsAdmin } from "@/components/admin/cards-admin";

export const metadata: Metadata = {
  title: "Kartice | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default function CardsAdminPage() {
  return <CardsAdmin />;
}
