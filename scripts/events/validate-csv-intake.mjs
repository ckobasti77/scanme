import fs from "node:fs";
import path from "node:path";

export const FILES = [
  "01-exhibitors.csv", "02-brands-stands.csv", "03-models.csv", "04-specifications.csv",
  "05-audience-questions.csv", "06-surveys.csv", "07-follow-up-email.csv", "08-qr-assignments.csv",
];

const SCHEMAS = {
  "01-exhibitors.csv": ["event_code", "participation_external_key", "exhibitor_name", "client_segment", "primary_contact_name", "primary_contact_email", "primary_contact_phone", "report_email", "pii_recipient_name", "pii_recipient_email", "pii_delivery_channel", "report_delivery_time_note", "account_external_key", "business_external_key", "source_reference", "internal_notes"],
  "02-brands-stands.csv": ["event_code", "participation_external_key", "brand_external_key", "brand_name", "stand_external_key", "stand_code", "map_location_id", "logo_source", "source_reference", "internal_notes"],
  "03-models.csv": ["event_code", "participation_external_key", "brand_external_key", "stand_external_key", "model_external_key", "display_name", "variant", "price_text", "price_confirmed", "package_tier", "package_active_from", "photo_source", "passport_eligible", "test_drive_contact_requirement", "test_drive_preferred_channel", "publication_status", "source_reference", "internal_notes"],
  "04-specifications.csv": ["event_code", "model_external_key", "display_order", "label", "value", "source_reference", "verified", "internal_notes"],
  "05-audience-questions.csv": ["event_code", "model_external_key", "event_day", "question_external_key", "display_order", "question_text", "option_1", "option_2", "option_3", "option_4", "option_5", "use_in_sponsored_rotation", "publication_status", "source_reference", "internal_notes"],
  "06-surveys.csv": ["event_code", "model_external_key", "survey_version", "question_external_key", "display_order", "question_text", "answer_type", "option_1", "option_2", "option_3", "option_4", "option_5", "required", "publication_status", "source_reference", "internal_notes"],
  "07-follow-up-email.csv": ["event_code", "model_external_key", "email_subject", "email_body", "exhibitor_text_confirmed", "planned_send_window", "publication_status", "source_reference", "internal_notes"],
  "08-qr-assignments.csv": ["event_code", "model_external_key", "resolver_code", "printed_label_id", "assignment_status", "assigned_at", "assigned_by", "verification_status", "verified_at", "verified_by", "verified_destination", "internal_notes"],
};

const EVENTS = {
  "elektromobilnost-2026": ["2026-10-09", "2026-10-11"],
  "auto-moto-fest-2026": ["2026-10-30", "2026-11-01"],
};
const TIERS = ["included", "starter", "advanced"];
const PUBLICATION = ["draft", "ready", "published", "withdrawn"];
const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;

function csv(text) {
  const rows = [], row = [], cell = [];
  let quoted = false, quoteClosed = false;
  const pushCell = () => { row.push(cell.join("")); cell.length = 0; quoteClosed = false; };
  const pushRow = () => { pushCell(); if (row.some((v) => v !== "")) rows.push(row.splice(0)); else row.length = 0; };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') { cell.push('"'); i += 1; }
      else if (c === '"') { quoted = false; quoteClosed = true; }
      else cell.push(c);
    } else if (quoteClosed) {
      if (c === ',') pushCell();
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && next === '\n') i += 1;
        pushRow();
      } else throw new Error("neočekivan znak posle zatvorenog navodnika");
    } else if (c === '"') {
      if (cell.length) throw new Error("navodnik unutar necitiranog polja");
      quoted = true;
    } else if (c === ',') pushCell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i += 1;
      pushRow();
    } else cell.push(c);
  }
  if (quoted) throw new Error("unterminated quoted field");
  if (cell.length || row.length || quoteClosed) pushRow();
  return rows;
}

const value = (row, key) => row[key] ?? "";
const nonempty = (row, key) => value(row, key).trim() !== "";
function add(errors, file, row, message) { errors.push(`${file}:${row}: ${message}`); }
function each(rows, file, fn) { rows.forEach((row, i) => fn(row, i + 2)); }
function duplicate(errors, rows, file, keys, label = keys.join("+")) {
  const seen = new Map();
  each(rows, file, (r, n) => {
    if (keys.some((key) => !nonempty(r, key))) return;
    const k = keys.map((x) => value(r, x)).join("\u0000");
    if (seen.has(k)) add(errors, file, n, `duplikat ${label} (red ${seen.get(k)})`);
    else seen.set(k, n);
  });
}
function required(errors, file, rows, keys) { each(rows, file, (r, n) => keys.forEach((k) => { if (!nonempty(r, k)) add(errors, file, n, `obavezno polje: ${k}`); })); }
function enumField(errors, file, rows, key, allowed) { each(rows, file, (r, n) => { const v = value(r, key); if (v && !allowed.includes(v)) add(errors, file, n, `${key} nije dozvoljen: ${v}`); }); }
function yesNo(errors, file, rows, keys) { keys.forEach((key) => each(rows, file, (r, n) => { const v = value(r, key); if (v && v !== "yes" && v !== "no") add(errors, file, n, `${key} mora biti yes ili no`); })); }
function isDate(v) {
  if (!DATE.test(v)) return false;
  const [year, month, day] = v.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}
function isDateTime(v) { return DATETIME.test(v) && !Number.isNaN(Date.parse(v)); }
function dateField(errors, file, rows, key, datetime = false) {
  each(rows, file, (r, n) => {
    const v = value(r, key);
    if (v && !(datetime ? isDateTime(v) : isDate(v))) add(errors, file, n, `${key} nije validan ${datetime ? "ISO datum/vreme sa vremenskom zonom" : "datum"}`);
  });
}
function eventModelKey(row) { return `${value(row, "event_code")}\u0000${value(row, "model_external_key")}`; }
function validateOptions(errors, file, row, line, answerType = "single_choice") {
  const opts = Array.from({ length: 5 }, (_, i) => value(row, `option_${i + 1}`).trim());
  const firstEmpty = opts.findIndex((option) => !option);
  const hasGap = firstEmpty >= 0 && opts.slice(firstEmpty + 1).some(Boolean);
  const count = opts.filter(Boolean).length;
  if (answerType === "yes_no") {
    if (count) add(errors, file, line, "yes_no pitanje ne sme imati option polja");
  } else if (count < 2 || count > 5 || hasGap) {
    add(errors, file, line, "single_choice pitanje mora imati 2–5 uzastopnih opcija");
  } else if (new Set(opts.filter(Boolean).map((option) => option.toLocaleLowerCase("sr-Latn"))).size !== count) {
    add(errors, file, line, "ponuđene opcije moraju biti različite");
  }
}

export function validateDirectory(dir) {
  const errors = [], files = {};
  for (const file of FILES) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) { errors.push(`${file}: fajl nedostaje`); files[file] = []; continue; }
    try {
      const rows = csv(fs.readFileSync(full, "utf8").replace(/^\uFEFF/, ""));
      if (!rows.length) { errors.push(`${file}: nedostaje zaglavlje`); files[file] = []; continue; }
      const [header, ...data] = rows;
      const expected = SCHEMAS[file];
      if (header.join("\u0000") !== expected.join("\u0000")) errors.push(`${file}: zaglavlje se ne poklapa sa šablonom`);
      data.forEach((cells, index) => {
        if (cells.length !== expected.length) errors.push(`${file}:${index + 2}: očekivano ${expected.length} kolona, pronađeno ${cells.length}`);
      });
      files[file] = data.map((cells) => Object.fromEntries(expected.map((key, i) => [key, (cells[i] ?? "").trim()] )));
    } catch (e) { errors.push(`${file}: neispravan CSV (${e.message})`); files[file] = []; }
  }
  const ex = files[FILES[0]], bs = files[FILES[1]], models = files[FILES[2]], specs = files[FILES[3]], qs = files[FILES[4]], surveys = files[FILES[5]], follow = files[FILES[6]], qrs = files[FILES[7]];
  for (const [file, rows] of Object.entries(files)) { each(rows, file, (r, n) => { if (value(r, "event_code") && !Object.hasOwn(EVENTS, value(r, "event_code"))) add(errors, file, n, `nepoznat event_code: ${value(r, "event_code")}`); }); }
  required(errors, FILES[0], ex, ["event_code", "participation_external_key", "exhibitor_name", "client_segment"]);
  required(errors, FILES[1], bs, ["event_code", "participation_external_key", "brand_external_key", "brand_name", "stand_external_key", "stand_code"]);
  required(errors, FILES[2], models, ["event_code", "participation_external_key", "brand_external_key", "stand_external_key", "model_external_key", "display_name", "price_text", "price_confirmed", "package_tier", "package_active_from", "publication_status"]);
  required(errors, FILES[3], specs, ["event_code", "model_external_key", "display_order", "label", "value"]);
  required(errors, FILES[4], qs, ["event_code", "model_external_key", "event_day", "question_external_key", "display_order", "question_text", "option_1", "option_2", "use_in_sponsored_rotation", "publication_status"]);
  required(errors, FILES[5], surveys, ["event_code", "model_external_key", "survey_version", "question_external_key", "display_order", "question_text", "answer_type", "required", "publication_status"]);
  required(errors, FILES[6], follow, ["event_code", "model_external_key", "exhibitor_text_confirmed", "planned_send_window", "publication_status"]);
  required(errors, FILES[7], qrs, ["event_code", "model_external_key", "resolver_code", "printed_label_id", "assignment_status", "verification_status"]);
  enumField(errors, FILES[0], ex, "client_segment", ["event_only", "standard"]); enumField(errors, FILES[2], models, "package_tier", TIERS); enumField(errors, FILES[2], models, "publication_status", PUBLICATION); enumField(errors, FILES[2], models, "test_drive_contact_requirement", ["email", "phone", "both", "any"]); enumField(errors, FILES[2], models, "test_drive_preferred_channel", ["email", "phone"]); enumField(errors, FILES[4], qs, "publication_status", PUBLICATION); enumField(errors, FILES[5], surveys, "publication_status", PUBLICATION); enumField(errors, FILES[6], follow, "publication_status", PUBLICATION); enumField(errors, FILES[5], surveys, "answer_type", ["yes_no", "single_choice"]); enumField(errors, FILES[7], qrs, "assignment_status", ["active", "released", "pending"]); enumField(errors, FILES[7], qrs, "verification_status", ["pending", "verified", "failed"]);
  yesNo(errors, FILES[0], ex, []); yesNo(errors, FILES[2], models, ["price_confirmed", "passport_eligible"]); yesNo(errors, FILES[3], specs, ["verified"]); yesNo(errors, FILES[4], qs, ["use_in_sponsored_rotation"]); yesNo(errors, FILES[5], surveys, ["required"]); yesNo(errors, FILES[6], follow, ["exhibitor_text_confirmed"]);
  each(ex, FILES[0], (r, n) => { for (const field of ["primary_contact_email", "report_email", "pii_recipient_email"]) if (nonempty(r, field) && !EMAIL.test(value(r, field))) add(errors, FILES[0], n, `${field} nije validna email adresa`); });
  dateField(errors, FILES[2], models, "package_active_from", true); dateField(errors, FILES[4], qs, "event_day"); dateField(errors, FILES[7], qrs, "assigned_at", true); dateField(errors, FILES[7], qrs, "verified_at", true);
  for (const [file, rows] of Object.entries(files)) each(rows, file, (r, n) => { for (const k of ["participation_external_key", "brand_external_key", "stand_external_key", "model_external_key", "question_external_key", "external_key"]) if (value(r, k) && !KEY.test(value(r, k))) add(errors, file, n, `${k} nije stabilan ključ`); });
  duplicate(errors, ex, FILES[0], ["event_code", "participation_external_key"], "učešće"); duplicate(errors, bs, FILES[1], ["event_code", "stand_external_key"], "štand"); duplicate(errors, models, FILES[2], ["event_code", "model_external_key"], "model"); duplicate(errors, specs, FILES[3], ["event_code", "model_external_key", "display_order"], "specifikacija"); duplicate(errors, qs, FILES[4], ["event_code", "question_external_key"], "pitanje"); duplicate(errors, qs, FILES[4], ["event_code", "model_external_key", "event_day", "display_order"], "redosled pitanja"); duplicate(errors, surveys, FILES[5], ["event_code", "model_external_key", "survey_version", "question_external_key"], "anketa"); duplicate(errors, surveys, FILES[5], ["event_code", "model_external_key", "survey_version", "display_order"], "redosled ankete"); duplicate(errors, follow, FILES[6], ["event_code", "model_external_key"], "follow-up"); duplicate(errors, qrs, FILES[7], ["resolver_code"], "QR kod"); duplicate(errors, qrs, FILES[7], ["printed_label_id"], "štampana oznaka"); duplicate(errors, qrs, FILES[7], ["event_code", "model_external_key"], "QR dodela modela");
  const participation = new Set(ex.map((r) => `${value(r, "event_code")}\u0000${value(r, "participation_external_key")}`)); const brandParticipation = new Set(bs.map((r) => `${value(r, "event_code")}\u0000${value(r, "participation_external_key")}\u0000${value(r, "brand_external_key")}`)); const stand = new Map(bs.map((r) => [`${value(r, "event_code")}\u0000${value(r, "stand_external_key")}`, r])); const model = new Map(models.map((r) => [eventModelKey(r), r]));
  each(bs, FILES[1], (r, n) => { if (!participation.has(`${value(r, "event_code")}\u0000${value(r, "participation_external_key")}`)) add(errors, FILES[1], n, "učešće ne postoji"); });
  each(models, FILES[2], (r, n) => { const p = `${value(r, "event_code")}\u0000${value(r, "participation_external_key")}`, b = `${p}\u0000${value(r, "brand_external_key")}`, s = `${value(r, "event_code")}\u0000${value(r, "stand_external_key")}`; if (!participation.has(p)) add(errors, FILES[2], n, "učešće ne postoji"); if (!brandParticipation.has(b)) add(errors, FILES[2], n, "brend nije vezan za dato učešće"); if (!stand.has(s)) add(errors, FILES[2], n, "štand ne postoji"); else if (value(stand.get(s), "brand_external_key") !== value(r, "brand_external_key") || value(stand.get(s), "participation_external_key") !== value(r, "participation_external_key")) add(errors, FILES[2], n, "štand nije vezan za dati brend/učešće"); });
  const validateModelRelations = (rows, file) => each(rows, file, (r, n) => { if (nonempty(r, "model_external_key") && !model.has(eventModelKey(r))) add(errors, file, n, `model_external_key ${value(r, "model_external_key")} ne postoji u istom događaju`); });
  validateModelRelations(specs, FILES[3]); validateModelRelations(qs, FILES[4]); validateModelRelations(surveys, FILES[5]); validateModelRelations(follow, FILES[6]); validateModelRelations(qrs, FILES[7]);
  each(models, FILES[2], (r, n) => {
    if (value(r, "price_confirmed") === "no" && value(r, "price_text") !== "Cena na upit") add(errors, FILES[2], n, "price_confirmed=no zahteva price_text=Cena na upit");
    if (value(r, "price_confirmed") === "yes" && value(r, "price_text") === "Cena na upit") add(errors, FILES[2], n, "Cena na upit ne može biti označena kao potvrđena cena");
    const hasTestDriveConfig = nonempty(r, "test_drive_contact_requirement") || nonempty(r, "test_drive_preferred_channel");
    if (hasTestDriveConfig && value(r, "package_tier") !== "advanced") add(errors, FILES[2], n, "podešavanja probne vožnje dozvoljena su samo za advanced");
    if (value(r, "passport_eligible") === "yes" && value(r, "package_tier") === "included") add(errors, FILES[2], n, "included model ne može biti kandidat za pasoš brenda");
  });
  each(specs, FILES[3], (r, n) => { if (value(r, "display_order") && (!/^\d+$/.test(value(r, "display_order")) || Number(value(r, "display_order")) < 1)) add(errors, FILES[3], n, "display_order mora biti pozitivan ceo broj"); });
  each(qs, FILES[4], (r, n) => {
    const e = EVENTS[value(r, "event_code")];
    if (e && isDate(value(r, "event_day")) && (value(r, "event_day") < e[0] || value(r, "event_day") > e[1])) add(errors, FILES[4], n, "event_day je van datuma događaja");
    if (!/^\d+$/.test(value(r, "display_order")) || Number(value(r, "display_order")) < 1) add(errors, FILES[4], n, "display_order mora biti pozitivan ceo broj");
    validateOptions(errors, FILES[4], r, n);
  });
  for (const r of models) { const key = `${value(r, "event_code")}\u0000${value(r, "model_external_key")}`, tier = value(r, "package_tier"), max = tier === "starter" ? 1 : tier === "advanced" ? 5 : 0; const days = new Set(qs.filter((q) => `${value(q, "event_code")}\u0000${value(q, "model_external_key")}` === key).map((q) => value(q, "event_day"))); for (const day of days) { const count = qs.filter((q) => `${value(q, "event_code")}\u0000${value(q, "model_external_key")}` === key && value(q, "event_day") === day).length; if (count > max) errors.push(`${FILES[4]}: model ${value(r, "model_external_key")} / ${day}: ${count} pitanja, paket dozvoljava najviše ${max}`); } }
  each(qs, FILES[4], (r, n) => { const m = model.get(eventModelKey(r)); if (m && value(r, "use_in_sponsored_rotation") === "yes" && value(m, "package_tier") !== "advanced") add(errors, FILES[4], n, "sponsored rotation je dozvoljen samo za advanced"); });
  const sponsored = new Map(); each(qs, FILES[4], (r, n) => { if (value(r, "use_in_sponsored_rotation") === "yes" && value(r, "publication_status") !== "withdrawn") { const k = eventModelKey(r); if (sponsored.has(k)) add(errors, FILES[4], n, `više od jednog sponsored pitanja (red ${sponsored.get(k)})`); else sponsored.set(k, n); } });
  each(surveys, FILES[5], (r, n) => {
    const m = model.get(eventModelKey(r));
    if (m && value(m, "package_tier") !== "advanced") add(errors, FILES[5], n, "anketa je dostupna samo advanced paketu");
    if (!/^\d+$/.test(value(r, "survey_version")) || Number(value(r, "survey_version")) < 1) add(errors, FILES[5], n, "survey_version mora biti pozitivan ceo broj");
    if (!/^\d+$/.test(value(r, "display_order")) || Number(value(r, "display_order")) < 1) add(errors, FILES[5], n, "display_order mora biti pozitivan ceo broj");
    validateOptions(errors, FILES[5], r, n, value(r, "answer_type"));
  });
  for (const r of models) { const key = eventModelKey(r); const versions = new Map(); for (const survey of surveys.filter((s) => eventModelKey(s) === key)) versions.set(value(survey, "survey_version"), (versions.get(value(survey, "survey_version")) ?? 0) + 1); for (const [version, count] of versions) if (count > 5) errors.push(`${FILES[5]}: model ${value(r, "model_external_key")} / verzija ${version}: anketa ima ${count} pitanja, maksimum je 5`); }
  each(follow, FILES[6], (r, n) => { const m = model.get(eventModelKey(r)); if (m && value(m, "package_tier") !== "advanced") add(errors, FILES[6], n, "follow-up je dostupan samo advanced paketu"); if (value(r, "exhibitor_text_confirmed") === "yes" && (!nonempty(r, "email_subject") || !nonempty(r, "email_body"))) add(errors, FILES[6], n, "potvrđen follow-up zahteva naslov i tekst emaila"); });
  each(qrs, FILES[7], (r, n) => {
    if (value(r, "verification_status") === "verified" && (!nonempty(r, "verified_at") || !nonempty(r, "verified_by") || !nonempty(r, "verified_destination"))) add(errors, FILES[7], n, "verified QR zahteva verified_at, verified_by i verified_destination");
    if (value(r, "assignment_status") === "active" && (!nonempty(r, "assigned_at") || !nonempty(r, "assigned_by"))) add(errors, FILES[7], n, "aktivna QR dodela zahteva assigned_at i assigned_by");
  });
  each(models, FILES[2], (r, n) => {
    if (value(r, "publication_status") !== "published") return;
    const key = eventModelKey(r);
    if (!specs.some((spec) => eventModelKey(spec) === key && value(spec, "verified") === "yes")) add(errors, FILES[2], n, "objavljen model zahteva najmanje jednu proverenu specifikaciju");
    const standRow = stand.get(`${value(r, "event_code")}\u0000${value(r, "stand_external_key")}`);
    if (!standRow || !nonempty(standRow, "map_location_id")) add(errors, FILES[2], n, "objavljen model zahteva validan map_location_id štanda");
    const activeQr = qrs.filter((qr) => eventModelKey(qr) === key && value(qr, "assignment_status") === "active" && value(qr, "verification_status") === "verified");
    if (activeQr.length !== 1) add(errors, FILES[2], n, "objavljen model zahteva tačno jedan aktivan i verifikovan QR");
  });
  return { ok: errors.length === 0, errors, files };
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/validate-csv-intake.mjs")) {
  const dir = process.argv[2] || path.resolve("docs/events/sajam-automobila-2026/templates");
  const result = validateDirectory(dir);
  if (result.ok) console.log(`CSV intake validan: ${FILES.length} fajlova (${dir})`);
  else { console.error(`CSV intake nije validan (${result.errors.length} grešaka):`); result.errors.forEach((e) => console.error(`- ${e}`)); process.exitCode = 1; }
}
