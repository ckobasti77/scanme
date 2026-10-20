import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { AdminV1Preview } from "@/components/admin/admin-v1-preview";

export const metadata: Metadata = { title: adminTitle("Pregled komponenti"), robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminV1PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminV1Preview />;
}
