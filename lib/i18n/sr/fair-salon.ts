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
  entryText: "Uđite u salon brenda, dodirnite automobil i zakažite probnu vožnju.",
  tileCount: (count: number) => fmt("{count} {unit} u salonu", { count: String(count), unit: cars(count) }),
  tileEnter: "Uđi u salon",
  tileDrive: "Probna vožnja",
  salonTitle: "{brand} salon",
  salonText: "{brand} na štandu Grand Motorsa, Auto Expo 2026. Izaberite automobil i zakažite probnu vožnju.",
  salonStageLabel: "Salon {brand}: automobili na podijumu",
  carAria: "{model}, {price}. Otvori detalje.",
  carHint: "Dodirni",
  viewedCount: (seen: number, total: number) => fmt("Pogledano {seen} od {total}", { seen: String(seen), total: String(total) }),
  allViewed: "Videli ste sve. Izaberite automobil za probnu vožnju.",
  panelClose: "Zatvori detalje",
  panelDrive: "Zakaži probnu vožnju",
  panelInterest: "Zainteresovan sam",
  panelDetails: "Detalji i fotografije",
  panelSent: "Zahtev je poslat",
  siteLink: "Još fotografija na {site}",
  leadTitle: "Probna vožnja sa štanda",
  leadText: "Ostavite ime i broj telefona, a Grand Motors će vam se javiti za termin.",
  leadDrive: "Zakaži probnu vožnju",
  leadInterest: "Pošalji upit",
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
