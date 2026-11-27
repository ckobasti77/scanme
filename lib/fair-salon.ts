// Auto Expo 2026 (27. 11.): the brand "salon" — real car cut-outs standing on a circle around a
// low round podium, every car aimed at one imagined point two podium diameters in front of the
// circle (owner). Pure config + geometry; the stage (components/fair/salon) only places what
// `fairSalonLayout` returns. Events without an entry here keep the plain brand page and the map.

export type FairSalonCutout = {
  src: string;
  width: number;
  height: number;
  /** World width of the car as photographed (a front view is narrower than a 3/4 view). */
  worldWidth: number;
  /** Where the lowest tyre touches the floor, as a fraction of the image height (measured from the
   * alpha channel; the MG files keep a soft baked shadow below it). The brand page cards put this
   * line on their floor, so every car stands at the same height. */
  ground: number;
};

export type FairSalonSpot = {
  modelSlug: string;
  /** Position on the circle: 0 = straight behind the podium centre, negative = left, positive = right. */
  angleDeg: number;
  cutout: FairSalonCutout;
};

export type FairSalonBrand = {
  /** URL segment of the brand page (`fairPassportBrandSlug`). */
  brandSlug: string;
  name: string;
  siteUrl: string;
  siteLabel: string;
  spots: readonly FairSalonSpot[];
};

export type FairSalonEvent = {
  brands: readonly FairSalonBrand[];
  background: { wide: FairSalonImage; tall: FairSalonImage };
};

export type FairSalonImage = { src: string; width: number; height: number };

const SALON_ROOT = "/fair/auto-expo-2026/salon";

const AUTO_EXPO_2026: FairSalonEvent = {
  brands: [
    {
      brandSlug: "ford",
      name: "Ford",
      siteUrl: "https://www.ford.rs",
      siteLabel: "ford.rs",
      spots: [
        { modelSlug: "ford-puma-mhev", angleDeg: -42, cutout: { src: `${SALON_ROOT}/ford-puma-34.webp`, width: 890, height: 500, worldWidth: 1.0, ground: 0.994 } },
        { modelSlug: "ford-kuga", angleDeg: 42, cutout: { src: `${SALON_ROOT}/ford-kuga-34.webp`, width: 937, height: 545, worldWidth: 1.05, ground: 0.995 } },
      ],
    },
    {
      brandSlug: "mg",
      name: "MG",
      siteUrl: "https://www.mgmotor.rs",
      siteLabel: "mgmotor.rs",
      spots: [
        { modelSlug: "mg3", angleDeg: -68, cutout: { src: `${SALON_ROOT}/mg3.webp`, width: 1400, height: 643, worldWidth: 1.08, ground: 0.967 } },
        { modelSlug: "mg-hs-hybrid", angleDeg: 0, cutout: { src: `${SALON_ROOT}/mg-hs-hybrid.webp`, width: 1400, height: 676, worldWidth: 1.2, ground: 0.919 } },
        { modelSlug: "mg-zs-hybrid", angleDeg: 68, cutout: { src: `${SALON_ROOT}/mg-zs-hybrid.webp`, width: 1400, height: 621, worldWidth: 1.12, ground: 0.957 } },
      ],
    },
  ],
  background: {
    wide: { src: `${SALON_ROOT}/bg-wide.webp`, width: 2560, height: 1440 },
    tall: { src: `${SALON_ROOT}/bg-tall.webp`, width: 1088, height: 1632 },
  },
};

const SALON_EVENTS: Readonly<Record<string, FairSalonEvent>> = {
  "auto-expo-2026": AUTO_EXPO_2026,
};

/** The salon of an event (public slug, `test-` prefix ignored), or null: that event keeps the map. */
export function fairSalonEvent(eventSlug: string): FairSalonEvent | null {
  return SALON_EVENTS[eventSlug.replace(/^test-/, "")] ?? null;
}

export function fairSalonBrand(eventSlug: string, brandSlug: string): FairSalonBrand | null {
  return fairSalonEvent(eventSlug)?.brands.find((brand) => brand.brandSlug === brandSlug) ?? null;
}

// --- Geometry ---------------------------------------------------------------------------------
// World units: podium radius 1, floor y = 0, +x right, +z towards the visitor. Cars stand on a
// circle a little inside the podium edge. The focal point sits two podium diameters in front of
// the circle: z = 1 + 2 * 2 = 5.

export const FAIR_SALON_CIRCLE = 0.8;
export const FAIR_SALON_FOCUS_Z = 5;
const CAMERA_Z = 6.4;
const CAMERA_HEIGHT = 0.75;

/** Stage aspects the stage renders (width / height): desktop and phone. */
export const FAIR_SALON_ASPECT = { wide: 16 / 9, tall: 4 / 5 } as const;

function lens(aspect: number) {
  const tall = aspect < 1.1;
  // Focal length as a fraction of the stage width; the horizon matches the background photos.
  const fx = tall ? 2.7 : 1.7;
  // The room photos meet wall and floor at ~60 % of the height: the podium stands below that.
  return { fx, fy: fx * aspect, horizonPct: tall ? 46 : 47 };
}

/** The podium ellipse on the floor (world radius 1), in % of the stage. */
export function fairSalonPodium(aspect: number) {
  const { fx, fy, horizonPct } = lens(aspect);
  const y = (z: number) => horizonPct + ((CAMERA_HEIGHT * fy) / (CAMERA_Z - z)) * 100;
  return {
    widthPct: round(((2 * fx) / CAMERA_Z) * 100),
    topPct: round(y(-1)),
    bottomPct: round(y(1)),
  };
}

export type FairSalonPlacement = {
  modelSlug: string;
  /** Horizontal centre of the car, % of the stage width. */
  xPct: number;
  /** Where the wheels touch the floor, % of the stage height. */
  yPct: number;
  /** Car width, % of the stage width. */
  widthPct: number;
  /** Turn towards the focal point in degrees (+ = nose to the visitor's right). */
  yawDeg: number;
  /** Paint order: higher is closer to the visitor. */
  zIndex: number;
};

/**
 * Screen placement of every spot for a stage of the given aspect (width / height). Wide stages
 * (desktop) frame the podium at about half the width; tall phone stages bring the camera closer,
 * so the podium fills the width and the cars stay large enough to tap.
 */
export function fairSalonLayout(spots: readonly FairSalonSpot[], aspect: number): FairSalonPlacement[] {
  const { fx, fy, horizonPct } = lens(aspect);
  const placed = spots.map((spot) => {
    const angle = (spot.angleDeg * Math.PI) / 180;
    const x = Math.sin(angle) * FAIR_SALON_CIRCLE;
    const z = -Math.cos(angle) * FAIR_SALON_CIRCLE;
    const depth = CAMERA_Z - z;
    const yaw = (Math.atan2(0 - x, FAIR_SALON_FOCUS_Z - z) * 180) / Math.PI;
    return {
      modelSlug: spot.modelSlug,
      xPct: round(50 + ((x * fx) / depth) * 100),
      yPct: round(horizonPct + ((CAMERA_HEIGHT * fy) / depth) * 100),
      widthPct: round(((spot.cutout.worldWidth * fx) / depth) * 100),
      yawDeg: round(yaw),
      z,
    };
  });
  const order = [...placed].sort((a, b) => a.z - b.z).map((entry) => entry.modelSlug);
  return placed.map((entry) => ({ modelSlug: entry.modelSlug, xPct: entry.xPct, yPct: entry.yPct, widthPct: entry.widthPct, yawDeg: entry.yawDeg, zIndex: order.indexOf(entry.modelSlug) + 1 }));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
