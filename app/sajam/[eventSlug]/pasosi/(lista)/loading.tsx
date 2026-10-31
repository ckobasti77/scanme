"use client";

import { FairListSkeleton, FairRouteLoading } from "@/components/fair/event-shell-loading";
import { fairPassportSr } from "@/lib/i18n/sr/fair-passport";

// Instant tab switch: the shell with "Pasoši" active and a skeleton while the page streams.
export default function FairPassportsLoading() {
  return (
    <FairRouteLoading current="passports">
      <FairListSkeleton label={fairPassportSr.loading} />
    </FairRouteLoading>
  );
}
