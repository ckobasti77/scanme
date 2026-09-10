import { notFound } from "next/navigation";
import { CustomersPreview } from "./customers-preview";

// Dev-only. Mirrors app/dev/venue-preview: unavailable in production.
export const dynamic = "force-dynamic";

export default function CustomersPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CustomersPreview />;
}
