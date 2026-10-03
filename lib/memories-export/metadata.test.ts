import { describe, expect, test } from "vitest";
import { buildMetadata, metadataBytes } from "./metadata";

describe("buildMetadata", () => {
  const metadata = buildMetadata({
    space: "Svadba Ane i Marka",
    generatedAt: Date.UTC(2026, 7, 28, 6, 0, 0),
    photos: [
      {
        file: "Sto 4/2026-08-27_2149_sto-04_01.jpg",
        table: "Sto 4",
        takenAt: new Date(Date.UTC(2026, 7, 27, 19, 49, 0)).toISOString(),
        visibility: "everyone",
        width: 2048,
        height: 1365,
      },
      {
        file: "Ostalo/2026-08-27_2200_ostalo_01.jpg",
        table: null,
        takenAt: new Date(Date.UTC(2026, 7, 27, 20, 0, 0)).toISOString(),
        visibility: "host_only",
        width: 2048,
        height: 1536,
      },
    ],
  });

  test("reports the survivor count and space name", () => {
    expect(metadata.photoCount).toBe(2);
    expect(metadata.space).toBe("Svadba Ane i Marka");
    expect(metadata.schema).toBe("scanme-memories-export/1");
  });

  test("carries NO guest identifier anywhere in the serialized JSON", () => {
    const json = new TextDecoder().decode(metadataBytes(metadata));
    for (const forbidden of ["guestKey", "guestId", "cardId", "guest"]) {
      expect(json.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  test("keeps only the human table label, and null for cardless", () => {
    expect(metadata.photos[0].table).toBe("Sto 4");
    expect(metadata.photos[1].table).toBeNull();
  });
});
