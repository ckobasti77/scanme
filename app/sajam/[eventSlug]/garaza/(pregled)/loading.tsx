"use client";

import { FairListSkeleton, FairRouteLoading } from "@/components/fair/event-shell-loading";
import { fairGarageSr } from "@/lib/i18n/sr/fair-garage";

// Instant tab switch: the shell with "Garaža" active and a skeleton while the page streams.
export default function FairGarageLoading() {
  return (
    <FairRouteLoading current="garage">
      <FairListSkeleton label={fairGarageSr.loading} />
    </FairRouteLoading>
  );
}
