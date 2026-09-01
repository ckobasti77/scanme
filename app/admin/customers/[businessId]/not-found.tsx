import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { adminLocationSr as dict } from "@/lib/i18n/sr/admin-location";

// The 404 a per-location subpage falls into — a location that does not exist, or
// a service that is not active on it (TASK-41, RFC-002 §2.6). There is no admin
// layout, so this carries its own minimal chrome.
export default function LocationNotFound() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
      <section className="w-full max-w-xl border border-border bg-card p-6 sm:p-10">
        <FileQuestion className="size-8 text-primary" aria-hidden="true" />
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">
          {dict.notFoundTitle}
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          {dict.notFoundBody}
        </p>
        <div className="mt-8">
          <Link href="/admin/customers" className="button-primary">
            {dict.backToCustomers}
          </Link>
        </div>
      </section>
    </main>
  );
}
