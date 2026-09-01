import type { Metadata } from "next";
import { CustomersAdmin } from "@/components/admin/customers-admin";

export const metadata: Metadata = {
  title: "Korisnici | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default function CustomersAdminPage() {
  return <CustomersAdmin />;
}
