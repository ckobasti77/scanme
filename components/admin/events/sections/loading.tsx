import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

export function SectionLoading() {
  return <AdminPanel><AdminLoadingState label={dict.loading} /></AdminPanel>;
}
