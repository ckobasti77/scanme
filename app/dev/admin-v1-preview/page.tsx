import { notFound } from "next/navigation";
import { AdminV1Preview } from "@/components/admin/admin-v1-preview";

export const dynamic = "force-dynamic";

export default function AdminV1PreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminV1Preview />;
}
