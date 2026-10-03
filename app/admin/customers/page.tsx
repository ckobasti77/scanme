import { redirect } from "next/navigation";
import {
  type AdminSearchParams,
  withSearchParams,
} from "@/lib/admin-v1/cutover";

export default async function CustomersAdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminSearchParams>;
}) {
  redirect(withSearchParams("/admin/klijenti", await searchParams));
}
