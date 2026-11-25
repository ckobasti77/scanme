// stranica brenda — the only place the brand page says anything,
// including its three-form counters (the card's rule: counters are
// functions). Components import `fairBrandSr` exactly like garage/map do.
// `{...}` placeholders go through fmt().
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
  // Hero eyebrow when the exhibitor has a numbered stand on the event map.
  eyebrowWithStand: "Brend · Štand {stand}",
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
  // Entry point from the brand passport to the brand page (all models +
  // the test-drive flow). aria takes {brand} through fmt().
  brandPageCtaLabel: "Svi modeli i probna vožnja",
  brandPageCtaAria: "Svi modeli i probna vožnja: {brand}",
  hint: "Bez aplikacije i registracije",
  requestedPill: "Prijavljeno",
  // Drive sheet (mockup sheet 2).
  sheetTitle: "Probna vožnja",
  sheetSubtitle: "{brand} · {location}",
  standLocation: "Štand {stand}",
  // Picker title per sheet kind; the number of models is not limited.
  sheetSelectModelsTestDrive: "Izaberite modele za probnu vožnju",
  sheetSelectModelsInterest: "Izaberite modele",
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
  // Interest: the model page's interest-sheet wording; "interesovanje" does not decline by count.
  submitInterest: "Pošalji interesovanje",
  // Same sending line as the model page's lead sheet (fair-model.ts leadSending).
  submitting: "Šalje se…",
  cancel: "Odustani",
  closeSheet: "Zatvori",
  dismissSheetAria: "Zatvori probnu vožnju",
  // Confirmation screen (mockup sheet 3). The copy is kind-picked: a test-drive
  // lead promises the call about the test-drive slot, an interest lead the offer. The counted
  // eyebrow resolves through modelsLine (the same three-form picker as every other counted
  // family in this file); the kind label sits before the separator in natural case and the
  // stylesheet uppercases it, exactly like the .lbl header row. The card's title is "Prijava
  // je poslata" — the old "Prijava poslana" was corrected to match it.
  successTitle: "Prijava je poslata",
  successEyebrowTestDrive: (count: number) => `Probna vožnja · ${modelsLine(count)}`,
  successEyebrowInterest: (count: number) => `Zainteresovan sam · ${modelsLine(count)}`,
  successBodyTestDrive: "{brand} će vas kontaktirati da dogovorite termin probne vožnje.",
  successBodyInterest: "{brand} će vas kontaktirati sa ponudom.",
  // The mockup drew an email-confirmation row; the system never e-mails the visitor, so
  // nothing renders these legacy lines — they stay only to satisfy the interface.
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
  // Lead-form errors. errorSend names the model(s) whose lead failed:
  // {models} is one name or several joined with ", ".
  errorName: "Unesite ime i prezime.",
  errorPhone: "Unesite ispravan broj telefona.",
  errorEmail: "Unesite email za potvrdu.",
  errorEmailInvalid: "Proverite format email adrese.",
  errorConsent: "Potrebna je saglasnost za slanje prijave.",
  errorSend: "Prijava za {models} nije poslata. Pokušajte ponovo.",
} as const satisfies FairBrandDict;
