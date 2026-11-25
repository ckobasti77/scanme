// stranica brenda (card 08) — the only place the brand page says anything,
// including its three-form counters (the card's rule: counters are
// functions). Components import `fairBrandSr` exactly like garage/map do.
// Card 09 adds `en/fair-brand.ts`. `{...}` placeholders go through fmt().
import { fmt, srPluralCategory } from "../format";
import type { FairBrandDict } from "../types";

// The app's three-form rule in one place (srPluralCategory, so 11-14 count as
// many). Every counted family on this surface resolves through this picker,
// so a new language only has to satisfy its categories (lib/i18n/plural.ts).
function brandPlural<T>(one: T, few: T, many: T, count: number): T {
  const category = srPluralCategory(count);
  return category === "one" ? one : category === "few" ? few : many;
}

// The two counted families, as the card's rule states them:
//   modelsOnStand: 1 -> "1 model", 2-4 -> "{n} modela", 5+ -> "{n} modela"
//     (11-14 as 5+) — the mockup's hero subtitle and the header label row;
//   selectedCount: 1 -> "1 izabran", 2-4 -> "{n} izabrana", 5+ -> "{n}
//     izabrano" (11-14 as 5+) — the picker: izabran is the masculine
//     adjective agreeing with model, so it declines its own three forms,
//     never the noun's case pattern.
// The number inside every returned line comes from fmt() (RFC-001 §2.12),
// never from a template-literal concatenation of a raw number.
const modelsLine = (count: number) =>
  fmt(
    brandPlural(
      "{count} model",
      "{count} modela",
      "{count} modela",
      count,
    ),
    { count: fmt("{count}", { count: String(count) }) },
  );
const selectedLine = (count: number) =>
  fmt(
    brandPlural(
      "{count} izabran",
      "{count} izabrana",
      "{count} izabrano",
      count,
    ),
    { count: fmt("{count}", { count: String(count) }) },
  );

export const fairBrandSr = {
  metaTitle: "{brand} | {event}",
  // Counted like every other counted line: the caller passes fmt(count) and
  // modelsOnStandWord(count) — a page that says "5 modela" never says
  // "5 model" in the description under it.
  metaDescription:
    "{brand} na sajmu: {count} {unit} sa specifikacijama, cenom i fotografijama. " +
    "Probna vožnja ili interesovanje se prijavljuju direktno prodavcu, bez " +
    "aplikacije i zakazivanja.",
  // The route's notFound() title — on the dictionary so no route can say
  // something different from the mockup (the page itself never renders it).
  notFoundTitle: "Stranica nije pronađena",
  eyebrow: "Brend",
  // The .lbl header row: label left (CSS uppercases it), the count right.
  // The count and the noun sit in two flex children, so the unit comes as
  // its own word — modelsOnStand(3) is the sentence the card names, the
  // header pair uses modelsOnStandLabel + modelsOnStandWord*.
  modelsOnStandLabel: "MODELI NA ŠTANDU",
  modelsOnStand: modelsLine,
  modelsOnStandWord: (count: number) =>
    brandPlural("model", "modela", "modela", count),
  modelsOnStandWordOne: "model",
  modelsOnStandWordFew: "modela",
  modelsOnStandWordMany: "modela",
  // The hero subtitle: "{count} modela na štandu. {names}". The trailing
  // space is load-bearing — the hero appends the model names after this
  // fragment, exactly as the pre-dictionary component did.
  modelsOnStandLine: (count: number) =>
    `${modelsLine(count)} na štandu. `,
  modelsOnStandLineOne: "{count} model na štandu. ",
  modelsOnStandLineFew: "{count} modela na štandu. ",
  modelsOnStandLineMany: "{count} modela na štandu. ",
  // The stamp is 7.5px/0.12em/800 with CSS text-transform: uppercase, so the
  // readable words live here and the look comes from the stylesheet. Its
  // mockup label is two lines: the component renders stampLabel lines
  // joined by its own <br/> markup — markup is never stored in a dictionary
  // string, because every text-rendering consumer (aria, tests) would carry
  // it.
  passportStampLabel: "Pasoš brenda",
  passportStampAria: "Pasoš brenda: {brand}",
  driveButton: "Prijavi probnu vožnju",
  hint: "Bez aplikacije i registracije",
  requestedPill: "Prijavljeno",
  // Drive sheet (mockup sheet 2).
  sheetTitle: "Probna vožnja",
  sheetSubtitle: "{brand} · {location}",
  sheetSelectModels: "Izaberite modele za probnu vožnju (1–3)",
  // The picker dock line: the card's izabran adjective family, as functions
  // and as the One/Few/Many keys any consumer can fmt().
  selectedCount: selectedLine,
  selectedCountWord: (count: number) =>
    brandPlural("izabran", "izabrana", "izabrano", count),
  selectedCountOne: "1 izabran",
  selectedCountFew: "{count} izabrana",
  selectedCountMany: "{count} izabrano",
  // The sheet's own count line is a noun phrase (mockup: "2 izabrana
  // modela"): {count} {word} izabrano declines as modelsOnStandWord*, and
  // the adjective is fixed neuter because it modifies the count, not the
  // noun, in that position.
  sheetSelectedModelsOne: "{count} model izabran",
  sheetSelectedModelsFew: "{count} modela izabrana",
  sheetSelectedModelsMany: "{count} modela izabrano",
  limitError: "Možete izabrati najviše 3 modela po prijavi.",
  nameLabel: "Ime i prezime",
  phoneLabel: "Telefon",
  emailLabel: "Email",
  optionalSuffix: " (neobavezno)",
  emailHelp: "Potvrda stiže na email · bez aplikacije i registracije",
  // The consent sentence is the visitor's own checkbox text and must agree
  // with the count actually chosen: 1 -> izabranog, 2-4 -> izabrana, 5+ ->
  // izabranih.
  consentOne: "Dajete saglasnost da {seller} kontaktira vas zbog {count} izabranog modela.",
  consentFew: "Dajete saglasnost da {seller} kontaktira vas zbog {count} izabrana modela.",
  consentMany: "Dajete saglasnost da {seller} kontaktira vas zbog {count} izabranih modela.",
  // The button follows the mockup's fixed strings, not per-number declension
  // ("2 -> Prijavi probne vožnje", 5+ as well); counted declension lives in
  // the counters above.
  submitOne: "Prijavi probnu vožnju",
  submitFew: "Prijavi probne vožnje",
  submitMany: "Prijavi probne vožnje",
  submitting: "Šaljemo prijavu...",
  cancel: "Odustani",
  closeSheet: "Zatvori",
  dismissSheetAria: "Zatvori probnu vožnju",
  // Confirmation screen (mockup sheet 3).
  successTitle: "Prijava poslana",
  successEyebrowOne: "{count} model poslat prodavcu",
  successEyebrowFew: "{count} modela poslata prodavcu",
  successEyebrowMany: "{count} modela poslato prodavcu",
  successBody: "{seller} će vas kontaktirati za {count} {unit} i termin probne vožnje.",
  successEmail: "Potvrdu šaljemo na {email} ·",
  successAnother: "Prijavi još jedan model",
  successBack: "Nazad na {brand}",
  // "Prijavljujete se kao {name}" — the parenthetical count agrees with the
  // models; the name never re-declines.
  signedInAsOne: "Prijavljujete se kao {name} ({count} izabran)",
  signedInAsFew: "Prijavljujete se kao {name} ({count} izabrana)",
  signedInAsMany: "Prijavljujete se kao {name} ({count} izabrano)",
  change: "Promeni",
  // Lead-form errors (cards 05/06 wire the mapping; the copy lives here).
  errorName: "Unesite ime i prezime.",
  errorPhone: "Unesite ispravan broj telefona.",
  errorEmail: "Unesite email za potvrdu.",
  errorEmailInvalid: "Proverite format email adrese.",
  errorConsent: "Potrebna je saglasnost za slanje prijave.",
  errorSend: "Nije uspelo slanje. Pokušajte ponovo.",
} as const satisfies FairBrandDict;
