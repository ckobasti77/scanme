import type { Metadata } from "next";
import { ClientPanelEntry } from "@/components/client-panel/client-panel-entry";

export const metadata: Metadata = {
  title: "Client panel | ScanMe",
  robots: { index: false, follow: false },
};

export default function ClientPanelEntryPage() {
  return <ClientPanelEntry />;
}
