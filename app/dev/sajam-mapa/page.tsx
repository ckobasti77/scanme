import { notFound, redirect } from "next/navigation";

// The retired preview must not expose a second, obsolete AMF map.
export default function RetiredFairMapPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  redirect("/sajam/auto-moto-fest-2026");
}
