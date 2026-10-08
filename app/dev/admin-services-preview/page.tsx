import { notFound } from "next/navigation";
import { AdminServiceOperations } from "@/components/admin/admin-service-operations";
import { AdminShell } from "@/components/admin/admin-shell";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

const services = {
  links: "scanme_links",
  review: "google_review",
  meni: "scanme_menu",
} as const;

export default async function AdminServicesPreviewPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { service } = await searchParams;
  const selected = service === "review" || service === "meni" ? service : "links";
  return <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} activePathname={`/admin/usluge/${selected}`}><AdminServiceOperations serviceType={services[selected]} preview /></AdminShell>;
}
