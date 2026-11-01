import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { safeAdminReturnPath } from "@/lib/admin-v1/cutover";

export const metadata: Metadata = { title: adminTitle("Prijava"), robots: { index: false, follow: false } };
export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const { returnTo } = await searchParams;
  return <AdminLogin returnTo={safeAdminReturnPath(returnTo)} />;
}
