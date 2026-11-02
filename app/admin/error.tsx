"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { AdminRouteError } from "@/components/admin/frame/admin-route-error";

// ADMIN v2 X6 (RX S5) — the error boundary of the admin pages. It sits below
// app/admin/layout.tsx, so a page that fails is replaced inside the screen and
// the frame (sidebar, navbar) stays; before, the error went to app/error.tsx
// above the frame.

const subscribe = () => () => undefined;

export default function AdminError({ error, unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  const pathname = usePathname();
  // The query is read on the client only (the address is not known while prerendering).
  const search = useSyncExternalStore(subscribe, () => window.location.search, () => "");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <AdminRouteError onRetry={unstable_retry} clearHref={search ? pathname : null} />;
}
