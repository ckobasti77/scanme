// Entrance-zone logos for the AMF map, pre-baked to the map's monochrome look
// (black + alpha, crops included) by scripts/fair/bake-map-logos.mjs. They are
// plain <img> with no CSS filter or mix-blend-mode: iOS Safari did not paint
// filtered/blended map labels reliably.
import aodes from "./brand-assets/map/aodes.png";
import amerikanac from "./brand-assets/map/amerikanac.png";
import aster from "./brand-assets/map/aster.png";
import autoHappy from "./brand-assets/map/auto-happy.png";
import benni from "./brand-assets/map/benni.png";
import detailing from "./brand-assets/map/detailing.png";
import direkcija from "./brand-assets/map/direkcija.png";
import goes from "./brand-assets/map/goes.png";
import kia from "./brand-assets/map/kia.png";
import kostic from "./brand-assets/map/kostic.png";
import nm from "./brand-assets/map/nm.png";
import parking from "./brand-assets/map/parking.png";
import servoremont from "./brand-assets/map/servoremont.png";
import swm from "./brand-assets/map/swm.png";
import ton from "./brand-assets/map/ton.png";
import xtreme from "./brand-assets/map/xtreme.png";
import zepter from "./brand-assets/map/zepter.png";

export const amfEntranceLogos = {
  aster, zepter, detailing, kostic, direkcija, ton, parking, xtreme,
  aodes, amerikanac, benni, goes, kia, nm, servoremont, swm,
  "auto-happy-foyer": autoHappy,
  "auto-happy-outdoor": autoHappy,
};

// Formerly cropped in an <svg viewBox> (the crop is now baked in): they keep the
// crop's sizing — full width, natural height — instead of the 60 % height box.
export const amfEntranceCroppedLogos: ReadonlySet<string> = new Set([
  "servoremont", "swm", "kia", "aodes", "auto-happy-foyer", "auto-happy-outdoor", "benni", "nm", "goes", "xtreme",
]);
