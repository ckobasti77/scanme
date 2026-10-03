// TASK-21 — the archive's `metadata.json` (RFC-001 §2.10; task STEP 2). For
// anyone who later wants to do something with the export programmatically: per
// photo the table, timestamp, visibility, and dimensions.
//
// TWO hard rules live here, both about what is ABSENT:
//   • GUESTS STAY ANONYMOUS. No `guestKey`, no `guestId`, no `cardId` — nothing
//     that identifies a person or survives as a handle outside the event. Only
//     the human table LABEL (which the host chose and printed on the card) and
//     the photo's own facts. The types below simply do not have those fields, so
//     they cannot leak by accident.
//   • DATA ONLY, no prose. Keys are stable English identifiers and values are
//     data (ISO timestamps, enum codes, numbers); there is no localizable
//     sentence in this file, which is why nothing here routes through i18n.

export interface ExportMetadataPhoto {
  // The photo's path inside the archive, e.g. "Sto 4/2026-08-27_2149_sto-04_01.jpg".
  file: string;
  // The human table label the host printed on the card, or null for a photo
  // taken without a table card. NEVER the card id.
  table: string | null;
  // When the photo was uploaded, ISO-8601 UTC. About the photo, not the guest.
  takenAt: string;
  visibility: "everyone" | "host_only";
  width: number;
  height: number;
}

export interface ExportMetadata {
  // Schema tag so a future reader can branch on shape.
  schema: "scanme-memories-export/1";
  // When this archive was assembled, ISO-8601 UTC.
  generatedAt: string;
  // The space's display name (an event/venue name the host set — not a person).
  space: string;
  // How many photos this archive actually contains (survivors, post-deletion).
  photoCount: number;
  photos: ExportMetadataPhoto[];
}

const encoder = new TextEncoder();

export function buildMetadata(input: {
  space: string;
  generatedAt: number;
  photos: ExportMetadataPhoto[];
}): ExportMetadata {
  return {
    schema: "scanme-memories-export/1",
    generatedAt: new Date(input.generatedAt).toISOString(),
    space: input.space,
    photoCount: input.photos.length,
    photos: input.photos,
  };
}

export function metadataBytes(metadata: ExportMetadata): Uint8Array {
  return encoder.encode(JSON.stringify(metadata, null, 2));
}
