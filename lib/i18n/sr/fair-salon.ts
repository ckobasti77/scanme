// Auto Expo 2026 (27. 11.): the brand salon, the event entry with the two brand tiles and the
// model photo slider. `{...}` placeholders go through fmt(); counters are functions (the app's
// three-form rule, srPluralCategory).
import { fmt, srPluralCategory } from "../format";
import type { FairSalonDict } from "../types";

function cars(count: number) {
  return srPluralCategory(count) === "one" ? "automobil" : "automobila";
}

export const fairSalonSr = {
  entryMetaTitle: "Ford i MG | {event}",
  entryTitle: "Ford i MG na štandu Grand Motorsa",
  tileCount: (count: number) => fmt("{count} {unit} u salonu", { count: String(count), unit: cars(count) }),
  tileEnter: "Uđi u salon",
  tileDrive: "Probna vožnja",
  panelDetails: "Detalji i fotografije",
  panelSent: "Zahtev je poslat",
  siteLink: "Još fotografija na {site}",
  stickyDrive: "Zakaži probnu vožnju",
  sliderLabel: "Fotografije: {model}",
  sliderSlide: "{index} od {total}",
  sliderPrev: "Prethodna fotografija",
  sliderNext: "Sledeća fotografija",
  sliderPause: "Zaustavi automatsko listanje",
  sliderPlay: "Pokreni automatsko listanje",
  sliderColors: "Boje",
  sliderColor: "Boja: {color}",
  sliderAltColor: "{model}, boja {color}, fotografija {index}",
  sliderAltPhoto: "{model}, fotografija {index}",
} as const satisfies FairSalonDict;
