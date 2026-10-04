import { redirect } from "next/navigation";
import {
  type AdminSearchParams,
  withSearchParams,
} from "@/lib/admin-v1/cutover";

export default async function ScanMeLinksAdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  redirect(withSearchParams("/admin/usluge/links", await searchParams));
}
