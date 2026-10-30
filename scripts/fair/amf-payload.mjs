// AMF 2026 (30 Oct 2026): builds the B1 import payload (convex/fairImport.ts)
// from the normalized intake amf-2026-unos-podaci.json. Specifications come
// from the JSON (scanned Dongfeng PDFs, SWM) or are transcribed below verbatim
// from the exhibitors' PDFs (Škoda and Fiat text PDFs, MG scanned price lists,
// "Luxury" column). Ford, Ineos: no unambiguous technical section → none.
// Usage: node scripts/fair/amf-payload.mjs <intake.json> <out.json> [--qr]
//   --qr adds the PROD sticker resolver codes (SA26-016…033, read on PROD 30 Oct).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { normalizeAmfModel } from "./normalize-amf-specs.mjs";

const [input, output, flag] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: amf-payload.mjs <intake.json> <out.json> [--qr]");
const intake = JSON.parse(readFileSync(input, "utf8"));

const PHOTO_BASE = "https://scanme.rs/fair/auto-moto-fest-2026/";

// PROD resolver codes of the printed stickers (inventory SML-SAJAM-26-QR).
const PROD_QR = {
  "SA26-016": "P7504HNJ", "SA26-017": "EQCX6KGP", "SA26-018": "XJRY86Q1", "SA26-019": "0ERAQT8R",
  "SA26-020": "TRKVS3GA", "SA26-021": "XN9BAX7K", "SA26-022": "GFSXWSEZ", "SA26-023": "MEEPAYTD",
  "SA26-024": "S5SM9W24", "SA26-025": "AK9YY1QW", "SA26-026": "WFYJCN2K", "SA26-027": "RW6YXQSB",
  "SA26-028": "DRGXQHC0", "SA26-029": "8R2XNYND", "SA26-030": "B43P40QA", "SA26-031": "YEKDCQ3T",
  "SA26-032": "8FYGG1JQ", "SA26-033": "4PWRZ76Y",
};

const skoda = (moment, power, consumption, co2, fuel, volume) => [
  ["Zapremina", volume],
  ["Maksimalni obrtni moment", moment],
  ["Maksimalna snaga", power],
  ["Prosečna potrošnja WLTP Kombinovano", consumption],
  ["WLTP CO₂", co2],
  ["Pogonsko gorivo", fuel],
];

// Sticker → verbatim label/value pairs from the source PDFs.
const PDF_SPECS = {
  "SA26-016": skoda("250/1500-3500 Nm/min.", "85 kW/115 ks", "5,2/100 km", "121 g/km", "benzin", "999 cc"),
  "SA26-017": skoda("200/1500-3500 Nm/min.", "85 kW/115 ks", "5,6 l/100 km", "126 g/km", "benzin", "999 cc"),
  "SA26-018": skoda("360/1600-2750 Nm/min.", "110 kW/150 ks", "4,5-4,9 l/100 km", "121 g/km", "dizel", "1968 cc"),
  "SA26-019": skoda("360/1600-2750 Nm/min.", "110 kW/150 ks", "5,5-6,2 l/100 km", "129 g/km", "benzin", "1498 cc"),
  "SA26-020": skoda("400/1750-3250 Nm/min.", "142 kW/193 ks", "6,3 l/100 km", "161 g/km", "dizel", "1968 cc"),
  "SA26-021": skoda("400/1.750-3.250 Nm/min.", "142 kW/193 ks", "5,9 l/100 km", "133 g/km", "dizel", "1968 cc"),
  "SA26-025": [
    ["Dužina × širina × visina", "3999X1763X1629 mm"],
    ["Međuosovinsko rastojanje", "2540 mm"],
    ["Motor", "1.2 T3"],
    ["Vrsta goriva", "Benzin"],
    ["Maksimalna snaga", "74 kW / 100 KS"],
    ["Maksimalni obrtni moment", "205 Nm"],
    ["Kapacitet rezervoara", "44 l"],
    ["Broj vrata", "5"],
    ["Broj sedišta", "5"],
    ["Zapremina prtljažnika", "412 l"],
    ["Težina prema DIN-u (kg)", "1.259"],
    ["Potrošnja goriva (l/100 km) kombinovano", "5.6"],
    ["Menjač", "Manuelni/6 + R"],
    ["Tip pogona", "Benzin/prednji pogon"],
    ["Maksimalna brzina (km/h)", "160"],
    ["Ubrzanje 0-100 km/h (sek.)", "10.6"],
    ["Prednji kočioni sistem", "Disk kočnice"],
    ["Zadnji kočioni sistem", "Doboši"],
    ["Upravljački sistem", "Električni servo upravljač"],
    ["Gume", "205/55 R17"],
  ],
  "SA26-026": [
    ["Motor", "1,5 L Hybrid +"],
    ["Snaga kW (KS)", "145 (197)"],
    ["Kombinovana potrošnja benzina (WLTP)", "5,0–5,1 l/100 km"],
    ["Kombinovana emisija CO₂ (WLTP)", "113–115 g/km"],
    ["Dužina/Širina/Visina (mm)", "4430/1818/1635"],
    ["Naplatci", "18\" Aluminijumske felne"],
    ["Dimenzije guma", "215/50R18"],
  ],
  "SA26-027": [
    ["Motor", "1,5T Hybrid+"],
    ["Snaga kW (KS)", "165 (225)"],
    ["Kombinovana potrošnja benzina (WLTP)", "5,5 l/100 km"],
    ["Kombinovana emisija CO₂ (WLTP)", "126 g/km"],
    ["Dužina/Visina/Širina (mm)", "4670/1665/1890"],
    ["Točkovi i pneumatici", "19\" \"Diamond cut Blade\" Aluminijumske felne 225/55 R19"],
  ],
  "SA26-028": [
    ["Baterija", "64 kWh"],
    ["Snaga kW (KS)", "170 (231)"],
    ["EV domet (WLTP)", "465 km"],
    ["CO₂ (WLTP)", "0 g/km"],
    ["Dužina/Visina/Širina (mm)", "4476/1633/1849"],
    ["Točkovi i pneumatici", "18\" aluminijumski naplatci Rotor dizajna 225/55 R18"],
  ],
  // Ford/Ineos: the exhibited engine is not confirmed, so only what is true for
  // every variant of the trim (price list "Puma/Kuga A4 Cenovnik", Ineos MY27,
  // ford.rs/novi-raptor for the Raptor, which has no price list yet).
  "SA26-029": [
    ["Dostupni motori", "1.0l EcoBoost 125PS mHEV / 1.0l EcoBoost 155PS mHEV"],
    ["Naplatci", "17\" aluminijumski naplatci 215/55 R17 94H"],
    ["Centralni ekran", "12\""],
    ["Digitalna kontrolna tabla vozača", "12,8\""],
  ],
  "SA26-030": [
    ["Naplatci", "18\" aluminijumske felne 225/60 R18"],
    ["Ogibljenje", "Sportsko ogibljenje"],
    ["Ekran osetljiv na dodir", "13,2\""],
    ["Digitalna instrument tabla", "12,3\""],
  ],
  "SA26-031": [
    ["Dostupni motori", "3,0-litarski EcoBoost V6 benzinski motor sa dual turbo punjačem i 2,0-litarski Bi-turbo EcoBlue dizelski motor"],
  ],
  "SA26-032": [
    ["Dostupni motori", "BMW 3.0L Benzin / BMW 3.0L Dizel"],
    ["Menjač", "automatski (8)"],
  ],
};

const SLUGS = {
  "SA26-016": "skoda-fabia", "SA26-017": "skoda-kamiq", "SA26-018": "skoda-octavia", "SA26-019": "skoda-karoq",
  "SA26-020": "skoda-kodiaq", "SA26-021": "skoda-superb", "SA26-022": "dongfeng-m-hero-817", "SA26-023": "dongfeng-box",
  "SA26-024": "dongfeng-forthing-t5-hev", "SA26-025": "fiat-grande-panda", "SA26-026": "mg-zs-hybrid",
  "SA26-027": "mg-hs-hybrid", "SA26-028": "mg-s5-ev", "SA26-029": "ford-puma-mhev", "SA26-030": "ford-kuga",
  "SA26-031": "ford-ranger-raptor", "SA26-032": "ineos-grenadier", "SA26-033": "swm-g01-pro",
};

// Passport: every exhibited model of the brand is in our service, all ≥ Starter
// (owner list, 30 Oct 2026; one model is enough since the owner decision of the
// same day). SWM is deliberately out: it exhibits several cars but bought the
// service for the G01 Pro only, so we do not know its whole line-up.
const PASSPORT_BRANDS = new Set(["Škoda", "Dongfeng", "MG", "Ford", "Fiat", "Ineos"]);
const CODES = {
  "auto-moto-fest-2026-autocacak-promet": "AUTOCACAK-PROMET",
  "auto-moto-fest-2026-nikom": "NIKOM",
  "auto-moto-fest-2026-grand-motors": "GRAND-MOTORS",
  "auto-moto-fest-2026-swm": "SWM",
};

let sortOrder = 0;
const participations = intake.exhibitors.map((ex) => {
  const code = CODES[ex.key];
  const standCode = ex.map_stand.replace(/^(hala|ispred)-/, "").toUpperCase();
  const stand = { externalKey: `${ex.key}-stand`, code: standCode, displayName: ex.brands.join(" i "), mapLocationId: ex.map_stand };
  return {
    externalKey: ex.key,
    accountExternalKey: `SMK-SAJAM-26-${code}`,
    businessExternalKey: `SML-SAJAM-26-${code}`,
    clientSegment: "event_only",
    brands: ex.brands.map((brand) => ({
      externalKey: `${ex.key}-${SLUGS[ex.models.find((m) => m.brand === brand).sticker].split("-")[0]}`,
      name: brand,
      stand,
      models: ex.models.filter((m) => m.brand === brand).map((m) => {
        const slug = SLUGS[m.sticker];
        const pairs = m.specs ?? PDF_SPECS[m.sticker] ?? [];
        return normalizeAmfModel({
          externalKey: `auto-moto-fest-2026-${slug}`,
          displayName: `${brand} ${m.name}`,
          ...(m.variant ? { variant: m.variant } : {}),
          slug,
          priceText: m.price_text,
          ...(m.price_secondary ? { priceSecondaryText: m.price_secondary } : {}),
          ...(m.link ? { externalUrl: m.link } : {}),
          packageTier: m.package,
          specifications: pairs.map(([label, value], index) => ({ label, value, order: index + 1 })),
          photoUrl: `${PHOTO_BASE}${slug}.webp`,
          passportEligible: PASSPORT_BRANDS.has(brand),
          sortOrder: ++sortOrder,
          ...(flag === "--qr" ? { assignedResolverCode: PROD_QR[m.sticker] } : {}),
        });
      }),
    })),
  };
});

const payload = { version: 1, eventCode: "auto-moto-fest-2026", participations };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(payload, null, 2) + "\n");
const models = participations.flatMap((p) => p.brands.flatMap((b) => b.models));
console.log(`models ${models.length}, without specs: ${models.filter((m) => !m.specifications.length).map((m) => m.slug).join(", ")}, chars ${JSON.stringify(payload).length}`);
