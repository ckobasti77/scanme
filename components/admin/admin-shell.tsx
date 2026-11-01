"use client";

import type { ReactNode } from "react";
import { AdminFrame, type AdminFrameProps } from "./frame/admin-frame";
import { useAdminFrame } from "./frame/admin-frame-context";

// ADMIN v2 — the admin frame lives in app/admin/layout.tsx (AdminFrameGate →
// AdminFrame). AdminShell stays for the places that are rendered outside
// that layout or still wrap themselves: the dev previews (app/dev/**) and
// the older screens (location, memories, venue). Inside a frame it adds
// nothing; without one it draws the same frame.

export function AdminShell({ children, ...preview }: AdminFrameProps): ReactNode {
  const frame = useAdminFrame();
  if (frame) return children;
  return <AdminFrame {...preview}>{children}</AdminFrame>;
}
