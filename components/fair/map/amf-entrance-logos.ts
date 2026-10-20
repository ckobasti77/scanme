import aodes from "./brand-assets/aodes.jpg";
import autoHappy from "./brand-assets/auto-happy.jpg";
import amerikanac from "./brand-assets/amerikanac.jpg";
import benni from "./brand-assets/benni.jpg";
import goes from "./brand-assets/goes.jpg";
import kia from "./brand-assets/kia.jpg";
import nm from "./brand-assets/nm-stomatologija.jpg";
import servoremont from "./brand-assets/servoremont.jpg";
import swm from "./brand-assets/swm.jpg";

const transparent = (name: string) => `/sajam/izlagaci/2026/providni/${name}.webp`;

export const amfEntranceLogos = {
  aster: transparent("aster-marketing"),
  zepter: transparent("zepter"),
  detailing: transparent("detailing-store"),
  kostic: transparent("kostic-rent-a-car"),
  direkcija: transparent("jkp-direkcija-za-javni-prevoz"),
  ton: transparent("turisticka-organizacija-nis"),
  parking: transparent("jkp-parking-servis-nis"),
  xtreme: "/fair/izlagaci/2026/xtreme-motors.jpg",
  aodes, amerikanac, benni, goes, kia, nm, servoremont, swm,
  "auto-happy-foyer": autoHappy,
  "auto-happy-outdoor": autoHappy,
};

// Crop the presentation viewport, not the original artwork: padded square JPGs
// otherwise reduce long wordmarks to a few pixels on a phone.
export const amfEntranceLogoCrops = {
  servoremont: { width: 300, height: 300, box: [12, 122, 278, 48] },
  swm: { width: 300, height: 300, box: [0, 122, 300, 56] },
  kia: { width: 301, height: 301, box: [3, 112, 294, 77] },
  aodes: { width: 300, height: 300, box: [0, 55, 300, 190] },
  "auto-happy-foyer": { width: 301, height: 301, box: [10, 75, 286, 140] },
  "auto-happy-outdoor": { width: 301, height: 301, box: [10, 75, 286, 140] },
  benni: { width: 300, height: 300, box: [6, 15, 286, 273] },
  nm: { width: 301, height: 301, box: [6, 16, 290, 250] },
  goes: { width: 301, height: 301, box: [19, 55, 264, 197] },
  xtreme: { width: 301, height: 301, box: [16, 22, 272, 260] },
} as const;
