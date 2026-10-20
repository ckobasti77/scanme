import type { FairPassportCatalogEntry, FairPassportProgress } from "@/lib/fair-contract";
import { fairPassportBrandSlug } from "@/lib/fair-passport";

// DEV-only passport simulation (development builds, one browser): the car
// brands of Auto Moto Fest 2026 (sajamautomobila.com/ucesnici-2026) with a
// chosen number of models and a chosen state, so the stamp passport overview
// and brand pages can be checked before the real intake exists. The choice
// lives in a cookie; nothing is written to Convex. Model names are test data.

export const FAIR_PASSPORT_SIM_COOKIE = "scanme_fair_passport_sim";

export type FairPassportSimBrands = "all" | "test" | number;
export type FairPassportSimModels = 2 | 6 | 11 | "random";
export type FairPassportSimState = "start" | "partial" | "new" | "complete" | "mixed";
export type FairPassportSimConfig = { brands: FairPassportSimBrands; models: FairPassportSimModels; state: FairPassportSimState };

export const FAIR_PASSPORT_SIM_MODELS: readonly FairPassportSimModels[] = [2, 6, 11, "random"];
export const FAIR_PASSPORT_SIM_STATES: readonly FairPassportSimState[] = ["start", "partial", "new", "complete", "mixed"];
export const FAIR_PASSPORT_SIM_MAX_MODELS = 11;

type SimBrand = { name: string; models: readonly string[]; logoUrl?: string };

export const FAIR_PASSPORT_SIM_BRANDS: readonly SimBrand[] = [
  { name: "Audi", models: ["A1", "A3", "A4", "A5", "A6", "Q2", "Q3", "Q4 e-tron", "Q5", "Q7", "Q8 e-tron"] },
  { name: "Volkswagen", models: ["Polo", "Golf", "T-Roc", "T-Cross", "Tiguan", "Passat", "Taigo", "ID.3", "ID.4", "ID.7", "Touareg"] },
  { name: "Toyota", models: ["Aygo X", "Yaris", "Yaris Cross", "Corolla", "Corolla Cross", "C-HR", "RAV4", "bZ4X", "Camry", "Land Cruiser", "Hilux"] },
  { name: "Citroën", models: ["C3", "C3 Aircross", "C4", "C4 X", "C5 Aircross", "C5 X", "ë-C3", "ë-C4", "Berlingo", "SpaceTourer", "Ami"] },
  { name: "Geely", models: ["Coolray", "Atlas", "Monjaro", "Okavango", "Emgrand", "Starray", "Tugella", "Preface", "EX5", "Galaxy E5", "Geometry C"] },
  { name: "Ford", models: ["Puma", "Kuga", "Focus", "Mustang Mach-E", "Explorer", "Capri", "Ranger", "Tourneo Courier", "Tourneo Connect", "Transit Custom", "Mustang"] },
  { name: "MG", models: ["MG3", "MG4", "MG5", "ZS", "HS", "Marvel R", "Cyberster", "MG4 XPower", "ZS Hybrid+", "HS PHEV", "MG7"] },
  { name: "Dacia", models: ["Sandero", "Sandero Stepway", "Logan", "Jogger", "Duster", "Bigster", "Spring", "Jogger Hybrid", "Duster Extreme", "Sandero Extreme", "Spring Extreme"] },
  { name: "Renault", models: ["Clio", "Captur", "Megane E-Tech", "Austral", "Arkana", "Espace", "Rafale", "Symbioz", "Scenic E-Tech", "Renault 5", "Kangoo"] },
  { name: "Opel", models: ["Corsa", "Astra", "Mokka", "Frontera", "Grandland", "Combo Life", "Zafira Life", "Corsa Electric", "Astra Sports Tourer", "Mokka GSE", "Vivaro"] },
  { name: "Peugeot", models: ["208", "2008", "308", "308 SW", "408", "3008", "5008", "e-208", "e-2008", "Rifter", "Traveller"] },
  { name: "Suzuki", models: ["Swift", "Ignis", "Vitara", "S-Cross", "Swace", "Across", "Jimny", "e Vitara", "Swift Sport", "Vitara Hybrid", "S-Cross Hybrid"] },
  { name: "Honda", models: ["Jazz", "Civic", "HR-V", "ZR-V", "CR-V", "e:Ny1", "Civic Type R", "CR-V e:PHEV", "Jazz Crosstar", "e:N1", "Prelude"] },
  { name: "Fiat", models: ["500", "500e", "Panda", "Grande Panda", "600", "600e", "Tipo", "Tipo Cross", "Doblò", "Ducato", "Pandina"] },
  { name: "Dongfeng", models: ["Box", "Mage", "Huge", "Vigo", "Shine", "Nammi 01", "007", "008", "Aeolus Yixuan", "Forthing T5", "Fengon 500"] },
  { name: "Mercedes-Benz", models: ["A-Klasa", "B-Klasa", "C-Klasa", "E-Klasa", "S-Klasa", "CLA", "GLA", "GLB", "GLC", "GLE", "EQA"] },
  { name: "Škoda", models: ["Fabia", "Scala", "Kamiq", "Octavia", "Superb", "Karoq", "Kodiaq", "Elroq", "Enyaq", "Enyaq Coupé", "Octavia Combi"] },
  { name: "Kia", models: ["Picanto", "Stonic", "Ceed", "XCeed", "Niro", "Sportage", "Sorento", "EV3", "EV6", "EV9", "K4"] },
  { name: "SWM", models: ["G01", "G01F", "G03F", "G05", "G05 Pro", "X3", "X7", "G01 Plus", "G03F Max", "G05 Sport", "X7 Plus"] },
];

/** Edge cases on top of the real list: a long name without a logo, and a brand with only an uploaded raster logo. */
const SIM_TEST_BRANDS: readonly SimBrand[] = [
  { name: "Arvena Gospodarska Vozila", models: ["S1", "T4", "Coupe", "X7", "City", "Tour", "Van", "Cargo", "Pick-up", "Kombi", "Max"] },
  { name: "Lumo", models: ["One", "City", "Cross", "Van", "Sport", "Tour", "Mini", "Max", "Coupe", "Cabrio", "Pick-up"], logoUrl: "/fair/fixtures/test-upload-logo.svg" },
];

/** Stable pseudo-random in [0, 1) per key (FNV-1a). */
function unit(key: string) {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 10007) / 10007;
}

export function serializeFairPassportSim(config: FairPassportSimConfig): string {
  return `${config.brands}.${config.models}.${config.state}`;
}

export function parseFairPassportSim(value: string | undefined | null): FairPassportSimConfig | null {
  const parts = (value ?? "").split(".");
  if (parts.length !== 3) return null;
  const [brandsRaw, modelsRaw, stateRaw] = parts;
  const count = Number(brandsRaw);
  const brands: FairPassportSimBrands | null = brandsRaw === "all" || brandsRaw === "test"
    ? brandsRaw
    : Number.isInteger(count) && count >= 1 && count <= FAIR_PASSPORT_SIM_BRANDS.length ? count : null;
  const models = FAIR_PASSPORT_SIM_MODELS.find((option) => String(option) === modelsRaw);
  const state = FAIR_PASSPORT_SIM_STATES.find((option) => option === stateRaw);
  return brands !== null && models !== undefined && state !== undefined ? { brands, models, state } : null;
}

function simBrands(brands: FairPassportSimBrands): readonly SimBrand[] {
  if (brands === "all") return FAIR_PASSPORT_SIM_BRANDS;
  if (brands === "test") return [...FAIR_PASSPORT_SIM_BRANDS, ...SIM_TEST_BRANDS];
  return FAIR_PASSPORT_SIM_BRANDS.slice(0, brands);
}

const MIXED_STATES: readonly Exclude<FairPassportSimState, "mixed">[] = ["partial", "new", "complete", "start"];

export type FairPassportSimulation = {
  /** localStorage namespace of this choice (`sim:<choice>`), so stuck stamps never mix with real ones. */
  eventId: string;
  catalog: FairPassportCatalogEntry[];
  progress: FairPassportProgress[];
  /** Stamps that start stuck on this device (the rest of the stamped ones are "new"). */
  stuck: Record<string, string[]>;
};

export function buildFairPassportSimulation(config: FairPassportSimConfig): FairPassportSimulation {
  const eventId = `sim:${serializeFairPassportSim(config)}`;
  const catalog: FairPassportCatalogEntry[] = [];
  const progress: FairPassportProgress[] = [];
  const stuck: Record<string, string[]> = {};
  simBrands(config.brands).forEach((brand, index) => {
    const slug = fairPassportBrandSlug(brand.name);
    const passportId = `sim-${slug}`;
    const count = config.models === "random" ? 1 + Math.floor(unit(`models:${slug}`) * FAIR_PASSPORT_SIM_MAX_MODELS) : config.models;
    const models = brand.models.slice(0, count).map((model) => ({
      eventModelId: `sim-${slug}-${fairPassportBrandSlug(model)}`,
      slug: `${slug}-${fairPassportBrandSlug(model)}`,
      displayName: `${brand.name} ${model}`,
    }));
    catalog.push({
      passportId,
      eventId,
      brandId: `sim-brand-${slug}`,
      brandName: brand.name,
      ...(brand.logoUrl ? { brandLogoUrl: brand.logoUrl } : {}),
      standMapLocationIds: [],
      models,
    });
    const state = config.state === "mixed" ? MIXED_STATES[index % MIXED_STATES.length] : config.state;
    const ids = models.map((model) => model.eventModelId);
    const half = Math.ceil(ids.length / 2);
    const stamped = state === "start" ? [] : state === "complete" ? ids : state === "new" ? ids.slice(0, Math.max(1, half)) : ids.slice(0, ids.length === 1 ? 0 : half);
    // "Ima novih": the last one or two stamped are still waiting to be stuck.
    const fresh = state === "new" ? Math.min(stamped.length, stamped.length > 2 ? 2 : 1) : 0;
    stuck[passportId] = stamped.slice(0, stamped.length - fresh);
    progress.push({
      passportId,
      stampedModelIds: stamped,
      stampedCount: stamped.length,
      requiredCount: ids.length,
      completed: stamped.length === ids.length && ids.length > 0,
    });
  });
  return { eventId, catalog, progress, stuck };
}

/** localStorage marker that a choice was seeded on this device (fair-passport.tsx); removed to start a choice over. */
export const FAIR_PASSPORT_SIM_SEEDED_PREFIX = "scanme:fair-passport-sim-seeded:";

/** `document.cookie` value that turns the simulation on with `config`, or off with null. */
export function fairPassportSimCookie(config: FairPassportSimConfig | null): string {
  return config
    ? `${FAIR_PASSPORT_SIM_COOKIE}=${serializeFairPassportSim(config)}; Path=/; Max-Age=604800; SameSite=Lax`
    : `${FAIR_PASSPORT_SIM_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}
