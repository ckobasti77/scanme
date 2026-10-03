import { notFound } from "next/navigation";
import { AdminEventsPreview } from "@/components/admin/admin-events-preview";

export default function AdminEventsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminEventsPreview />;
}
