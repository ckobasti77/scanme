import type { FairMapGeometry } from "./types";

// Auto Expo 2026 (27–29. 11., Šumadija sajam, Kragujevac) — owner, 26. 11. 2026:
// ScanMe is not the fair's partner and there is no organizer floor plan nor a
// stand number. So the map is SCHEMATIC: one zone with one open area ("Hala")
// where the exhibitor's stand(s) sit (map location "hala"). Nothing is traced
// and no hall layout is invented; the image is a plain neutral background at
// the area's pixel size (the public map draws only the polygons).
export const AUTO_EXPO_2026_MAP: FairMapGeometry = {
  key: "auto-expo-2026",
  status: "draft",
  schematic: true,
  // No organizer page was used (nothing traced).
  sourcePage: "",
  capturedOn: "2026-11-26",
  zones: [
    {
      id: "hala",
      image: { src: "/sajam/mape/auto-expo-hala.jpg", width: 1200, height: 800, organizerFile: "" },
      locations: [
        { id: "hala", label: "Hala", kind: "area", placement: "organizer", polygon: [[60, 60], [1140, 60], [1140, 740], [60, 740]] },
      ],
      landmarks: [],
    },
  ],
};
