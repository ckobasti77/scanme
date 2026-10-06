import { notFound } from "next/navigation";
import { AdminEventsPreview } from "@/components/admin/admin-events-preview";
import { parseViewModeParam } from "@/lib/admin-v1/view-mode";

export default async function AdminEventsPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; prikaz?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { tab, prikaz } = await searchParams;
  return <AdminEventsPreview tab={tab} view={parseViewModeParam(prikaz)} />;
}
