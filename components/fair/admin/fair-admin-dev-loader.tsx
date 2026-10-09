"use client";

import dynamic from "next/dynamic";
import type { FairAdminDevSheetProps } from "./fair-admin-dev-sheet";

// The sheet is its own chunk, fetched only when the server rendered this
// loader for a verified admin; a visitor's page never references it.
const FairAdminDevSheet = dynamic(() => import("./fair-admin-dev-sheet").then((module) => module.FairAdminDevSheet), { ssr: false });

export function FairAdminDevLoader(props: FairAdminDevSheetProps) {
  return <FairAdminDevSheet {...props} />;
}
