"use client";

import { createContext, useContext } from "react";
import type { AdminRoute } from "@/lib/admin-v2/frame/routes";

// ADMIN v2 — what the parts of the frame share: the route (which admin page
// this is, also in a dev preview) and the phone drawer. null = no frame
// around the component (a test, an unframed page).

export type AdminDrawerTarget = "nav" | "filters";

export type AdminFrameValue = {
  route: AdminRoute;
  /** The path the navbar marks as current (a dev preview names its admin route). */
  activePath: string;
  drawer: AdminDrawerTarget | null;
  openDrawer: (target: AdminDrawerTarget) => void;
  closeDrawer: () => void;
};

export const AdminFrameContext = createContext<AdminFrameValue | null>(null);

export function useAdminFrame(): AdminFrameValue | null {
  return useContext(AdminFrameContext);
}
