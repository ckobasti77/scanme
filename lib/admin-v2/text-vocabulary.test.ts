import { describe, expect, test } from "vitest";
import { adminLocationSr } from "@/lib/i18n/sr/admin-location";
import { cardsAdminSr } from "@/lib/i18n/sr/cards-admin";
import { communicationsSr } from "@/lib/i18n/sr/communications";
import { memoriesAdminSr } from "@/lib/i18n/sr/memories-admin";
import { menuAdminSr } from "@/lib/i18n/sr/menu-admin";
import { orderingAdminSr } from "@/lib/i18n/sr/ordering-admin";
import { venueAdminSr } from "@/lib/i18n/sr/venue-admin";
import { adminDomainSr } from "@/lib/i18n/sr/admin-domain";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminFinanceSr } from "@/lib/i18n/sr/admin-finance";
import { adminOrdersSr } from "@/lib/i18n/sr/admin-orders";
import { adminProductsSr } from "@/lib/i18n/sr/admin-products";
import { adminSearchSr } from "@/lib/i18n/sr/admin-search";
import { adminServicesSr } from "@/lib/i18n/sr/admin-services";
import { adminSettingsSr } from "@/lib/i18n/sr/admin-settings";
import { adminTasksSr } from "@/lib/i18n/sr/admin-tasks";
import { adminTeamSr } from "@/lib/i18n/sr/admin-team";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { fairAdminDevSr } from "@/lib/i18n/sr/fair-admin-dev";
import { postaSr } from "@/lib/i18n/sr/posta";

// docs/admin/v2/RECNIK.md — the words an operator does not read. The test
// walks every admin dictionary (every string value, at any depth) and fails
// with the dictionary, the key and the text of each hit. A word may come back
// only through a decision in RECNIK.md (and here).

/** [pattern, what to write instead] — the same rows as the first table of RECNIK.md. */
export const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/read[- ]?model/i, "podaci o klijentima / pregled finansija / pregled poruka"],
  [/ADMIN-(?:V1|\d+)/, "bez oznake modula: šta korisnik vidi"],
  [/materijaliz/i, "pripremljeni profili"],
  [/projekcij/i, "ukupan zbir / brojevi na početnoj strani"],
  [/\bhealth\b/i, "ispravnost"],
  [/\blegacy\b/i, "stari sistem / nasleđeno"],
  [/\bfixtures?\b/i, "probni podaci"],
  [/dev[- ]only|\bDEV\b|neprodukcijsk|\bsintetič/i, "probni podaci / probni prikaz"],
  [/\bprovider|provajder/i, "usluga za slanje poruka"],
  [/\bmailbox\b|\boutbox\b|\binbound\b|\bOAuth\b/i, "sanduče / slanje / prijem poruka / prijava na nalog pošte"],
  [/SMF sufiks/i, "kratka šifra proizvoda"],
  [/\bsnapshot/i, "sačuvana verzija"],
  [/\baudit/i, "istorija izmena"],
  [/\bledger\b/i, "knjiga uplata"],
  [/\bactors?\b|\bakter/i, "ko je uradio"],
  [/\bbackend/i, "server i baza"],
  [/\bwaiver\b/i, "oslobađanje od naplate"],
  [/\btargets?\b/i, "pretplata / kolona"],
  [/\bslug\b/i, "adresa (deo linka)"],
  [/\bfallback\b/i, "zamenski / zamena"],
  [/\bconvex\b/i, "tehnički tim / server"],
  [/\bpayload\b|\bwebhook\b|\bcache\b/i, "opiši šta korisnik vidi"],
  [/\bbrowser/i, "pregledač"],
  [/\btokeni?\b|\btokena\b/i, "pristupni podaci"],
  [/\bpreview\b/i, "probni prikaz / pregled"],
  [/eksplicit/i, "izričit / ručno unet"],
];

export function forbiddenIn(text: string): string[] {
  return FORBIDDEN.filter(([pattern]) => pattern.test(text)).map(([pattern]) => String(pattern));
}

const DICTIONARIES: ReadonlyArray<readonly [string, unknown]> = [
  ["admin-domain", adminDomainSr],
  ["admin-events", adminEventsSr],
  ["admin-finance", adminFinanceSr],
  ["admin-orders", adminOrdersSr],
  ["admin-products", adminProductsSr],
  ["admin-search", adminSearchSr],
  ["admin-services", adminServicesSr],
  ["admin-settings", adminSettingsSr],
  ["admin-tasks", adminTasksSr],
  ["admin-team", adminTeamSr],
  ["admin-ui", adminUiSr],
  ["admin-v1", adminV1Sr],
  ["fair-admin-dev", fairAdminDevSr],
  ["posta", postaSr],
  ["admin-location", adminLocationSr],
  ["cards-admin", cardsAdminSr],
  ["communications", communicationsSr],
  ["memories-admin", memoriesAdminSr],
  ["menu-admin", menuAdminSr],
  ["ordering-admin", orderingAdminSr],
  ["venue-admin", venueAdminSr],
];

// The DEV passport simulation of the fair app (components/fair/admin, components/fair/passport) names itself
// „DEV“ on purpose: it is fair code on main, not admin text, so these keys are not checked here.
const FAIR_DEV_SIMULATION_KEYS = new Set(["simNote", "simMenuTitle", "simTabAria", "simBar"]);

function* strings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value];
  else if (Array.isArray(value)) for (const [index, item] of value.entries()) yield* strings(item, `${path}[${index}]`);
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) yield* strings(item, path ? `${path}.${key}` : key);
}

describe("rečnik admina: tekst bez programerskog jezika", () => {
  test("the check finds what it should (and only that)", () => {
    expect(forbiddenIn("Legacy porudžbine posle ADMIN-11 migracije")).toHaveLength(2);
    expect(forbiddenIn("Klijenti će se pojaviti čim se u sistemu pojavi prvi nalog.")).toEqual([]);
    expect(forbiddenIn("Kolona Health")).toHaveLength(1);
    expect(forbiddenIn("Pregled pisma")).toEqual([]);
  });

  for (const [name, dictionary] of DICTIONARIES) {
    test(`${name}: nijedan izraz iz rečnika u vidljivom tekstu`, () => {
      const hits: string[] = [];
      for (const [key, text] of strings(dictionary, "")) {
        if (name === "fair-admin-dev" && FAIR_DEV_SIMULATION_KEYS.has(key)) continue;
        const found = forbiddenIn(text);
        if (found.length) hits.push(`${name}.${key}: ${found.join(", ")} → „${text.slice(0, 90)}“`);
      }
      expect(hits).toEqual([]);
    });
  }
});
