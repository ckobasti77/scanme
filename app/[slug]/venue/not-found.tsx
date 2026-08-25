// Segment 404 for /[slug]/venue* (RFC-001 §2.7) — reached only when the
// business does not exist or owns no Venue profile. Copy from the venue
// dictionary; rendered in the default venue design so even the dead end looks
// intentional.

import { VenueStateScreen } from "@/components/venue/venue-template";
import { venueSr as dict } from "@/lib/i18n/sr/venue";

export default function VenueNotFound() {
  return (
    <VenueStateScreen
      badge={null}
      title={dict.notFoundTitle}
      eyebrow="ScanMe"
      logoUrl={null}
      body={dict.notFoundBody}
    />
  );
}
