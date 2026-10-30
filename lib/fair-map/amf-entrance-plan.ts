import type { FairMapPoint } from "./types";

// Visitor drawing: retain the entrance/forecourt relationships, while widening
// the indoor booths for readable marks rather than copying floor-plan areas.
export function amfEntrancePoint([x, y]: FairMapPoint): FairMapPoint {
  return [24 + x * 0.85, 24 + y * 0.85];
}

export const AMF_ENTRANCE_SIZE = { width: 1000, height: 970 } as const;

export const AMF_FORECOURT_SCALE = 1.15;

// Enlarge towards the free space above/left; keep the right/bottom margin.
export function amfForecourtPoint([x, y]: FairMapPoint): FairMapPoint {
  return [1120 + (x - 1120) * AMF_FORECOURT_SCALE, 1080 + (y - 1080) * AMF_FORECOURT_SCALE];
}

export const AMF_ENTRANCE_PLAN = {
  foyer: [[310, 730], [865, 730], [800, 500], [750, 250], [700, 46], [80, 46], [34, 730], [195, 730]] as FairMapPoint[],
  doorway: { left: 195, right: 310, y: 730 },
  stairs: { x: 300, y: 260, width: 150, height: 190 },
  outsideSteps: { x: 195, y: 744, width: 115, height: 58 },
};

const booth = (x: number, y: number, width: number, height: number): FairMapPoint[] => [[x, y], [x + width, y], [x + width, y + height], [x, y + height]];

export const AMF_ENTRANCE_STANDS: Readonly<Record<string, readonly FairMapPoint[]>> = {
  aster: booth(100, 60, 280, 85),
  zepter: booth(395, 60, 210, 85),
  makete: booth(75, 165, 170, 80),
  lukac: booth(70, 255, 170, 85),
  nm: booth(65, 350, 175, 85),
  detailing: booth(60, 445, 180, 85),
  // 30 Oct 2026: stand 16 shared by Kostić and Asteriks (organizer plan 16.10).
  kostic: booth(55, 545, 118, 70),
  asteriks: booth(178, 545, 67, 70),
  scanme: booth(260, 165, 240, 80),
  amerikanac: booth(515, 165, 175, 85),
  direkcija: booth(500, 275, 180, 115),
  ton: booth(500, 405, 165, 110),
  goes: booth(270, 470, 210, 135),
  "auto-happy-foyer": booth(55, 620, 190, 90),
  benni: booth(340, 620, 170, 90),
  servoremont: booth(520, 620, 300, 90),
  parking: booth(500, 525, 280, 80),
  aodes: [[727, 757], [796, 884], [530, 1024], [463, 897]],
  xtreme: [[914, 660], [981, 788], [800, 883], [731, 757]],
  "auto-happy-outdoor": [[600, 982], [739, 982], [739, 1066], [600, 1066]],
  swm: [[755, 982], [895, 982], [895, 1066], [755, 1066]],
  kia: [[927, 931], [1119, 931], [1119, 1066], [927, 1066]],
};
