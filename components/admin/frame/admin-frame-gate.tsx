"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdminGuard } from "@/components/admin/admin-guard";
import { isFramedAdminPath } from "@/lib/admin-v2/frame/routes";
import { AdminFrame } from "./admin-frame";

// ADMIN v2 — what app/admin/layout.tsx renders: every admin page inside the
// guard and the frame, except the paths that stay without a frame (the
// sign-in screen, the full-screen Links editor). The layout is shared, so the
// frame keeps its state while the pages change.

export function AdminFrameGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!isFramedAdminPath(pathname)) return children;
  return (
    <AdminGuard>
      <AdminFrame>{children}</AdminFrame>
    </AdminGuard>
  );
}
