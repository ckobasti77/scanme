import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { FILES, validateDirectory } from "./validate-csv-intake.mjs";

const templateDir = path.resolve("docs/events/sajam-automobila-2026/templates");
const tempDirs: string[] = [];
const headers = Object.fromEntries(FILES.map((file) => [file, fs.readFileSync(path.join(templateDir, file), "utf8").trim().split(",")]));
afterEach(() => {
  tempDirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

function line(file: string, values: Record<string, string>) {
  return headers[file].map((key) => {
    const raw = values[key] ?? "";
    return /[",\r\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  }).join(",");
}

function fixture(overrides: Record<string, string[]> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scanme-csv-") );
  tempDirs.push(dir);
  for (const file of FILES) {
    const header = fs.readFileSync(path.join(templateDir, file), "utf8").trim();
    fs.writeFileSync(path.join(dir, file), `${header}${overrides[file] ? `\n${overrides[file].join("\n")}` : ""}\n`, "utf8");
  }
  return dir;
}

describe("event CSV intake validator", () => {
  test("accepts the eight empty UTF-8 templates", () => {
    expect(validateDirectory(fixture()).ok).toBe(true);
  });

  test("accepts a connected minimal dataset and quoted CSV values", () => {
    const dir = fixture({
      "01-exhibitors.csv": [line("01-exhibitors.csv", { event_code: "elektromobilnost-2026", participation_external_key: "participacija-1", exhibitor_name: "Enigma Motors", client_segment: "event_only", primary_contact_name: "Aleksa", primary_contact_email: "aleks@example.com", account_external_key: "account-1", business_external_key: "business-1", source_reference: "telefon", internal_notes: "Napomena, sa zarezom" })],
      "02-brands-stands.csv": [line("02-brands-stands.csv", { event_code: "elektromobilnost-2026", participation_external_key: "participacija-1", brand_external_key: "volta", brand_name: "Volta", stand_external_key: "elektromobilnost-2026-stand-a12", stand_code: "A12", map_location_id: "map-a12" })],
      "03-models.csv": [line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "participacija-1", brand_external_key: "volta", stand_external_key: "elektromobilnost-2026-stand-a12", model_external_key: "elektromobilnost-2026-volta-x1", display_name: "X1", price_text: "Cena na upit", price_confirmed: "no", package_tier: "starter", package_active_from: "2026-10-01T10:00:00+02:00", passport_eligible: "no", publication_status: "draft" })],
      "04-specifications.csv": [line("04-specifications.csv", { event_code: "elektromobilnost-2026", model_external_key: "elektromobilnost-2026-volta-x1", display_order: "1", label: "Domet", value: "300 km", verified: "yes" })],
      "05-audience-questions.csv": [line("05-audience-questions.csv", { event_code: "elektromobilnost-2026", model_external_key: "elektromobilnost-2026-volta-x1", event_day: "2026-10-09", question_external_key: "q1", display_order: "1", question_text: "Šta vam je najvažnije?", option_1: "Cena", option_2: "Domet", use_in_sponsored_rotation: "no", publication_status: "draft" })],
      "08-qr-assignments.csv": [line("08-qr-assignments.csv", { event_code: "elektromobilnost-2026", model_external_key: "elektromobilnost-2026-volta-x1", resolver_code: "QR-001", printed_label_id: "label-001", assignment_status: "active", assigned_at: "2026-10-01T10:00:00Z", assigned_by: "Aleksa", verification_status: "verified", verified_at: "2026-10-01T11:00:00Z", verified_by: "Jovan", verified_destination: "/r/QR-001" })],
    });
    expect(validateDirectory(dir)).toMatchObject({ ok: true });
  });

  test("reports duplicate keys, broken relations, invalid enums, dates and package limits", () => {
    const dir = fixture({
      "01-exhibitors.csv": [line("01-exhibitors.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", exhibitor_name: "Ex", client_segment: "event_only" })],
      "02-brands-stands.csv": [line("02-brands-stands.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", brand_name: "B", stand_external_key: "bad-stand", stand_code: "S1" })],
      "03-models.csv": [
        line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", stand_external_key: "bad-stand", model_external_key: "m1", display_name: "M", price_text: "Cena na upit", price_confirmed: "no", package_tier: "included", package_active_from: "2026-10-01T10:00:00Z", passport_eligible: "no", publication_status: "draft" }),
        line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", stand_external_key: "bad-stand", model_external_key: "m1", display_name: "M2", price_text: "Cena na upit", price_confirmed: "no", package_tier: "starter", package_active_from: "2026-10-01T10:00:00Z", passport_eligible: "no", publication_status: "draft" }),
      ],
      "05-audience-questions.csv": [
        line("05-audience-questions.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", event_day: "2026-10-12", question_external_key: "q1", display_order: "1", question_text: "Q", option_1: "A", option_2: "B", use_in_sponsored_rotation: "no", publication_status: "draft" }),
        line("05-audience-questions.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", event_day: "2026-10-12", question_external_key: "q2", display_order: "2", question_text: "Q", option_1: "A", option_2: "B", use_in_sponsored_rotation: "no", publication_status: "draft" }),
      ],
    });
    const result = validateDirectory(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/duplikat model/);
    expect(result.errors.join("\n")).toMatch(/van datuma događaja/);
    expect(result.errors.join("\n")).toMatch(/najviše 1/);
  });

  test("rejects advanced-only content on included models and incomplete active QR assignment", () => {
    const dir = fixture({
      "03-models.csv": [line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", stand_external_key: "s1", model_external_key: "m1", display_name: "M", price_text: "Cena na upit", price_confirmed: "no", package_tier: "included", package_active_from: "2026-10-01T10:00:00Z", passport_eligible: "yes", test_drive_contact_requirement: "phone", publication_status: "draft" })],
      "06-surveys.csv": [line("06-surveys.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", survey_version: "1", question_external_key: "q1", display_order: "1", question_text: "Q", answer_type: "yes_no", required: "no", publication_status: "draft" })],
      "07-follow-up-email.csv": [line("07-follow-up-email.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", exhibitor_text_confirmed: "no", planned_send_window: "24-48h", publication_status: "ready" })],
      "08-qr-assignments.csv": [line("08-qr-assignments.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", resolver_code: "QR-1", printed_label_id: "label-1", assignment_status: "active", verification_status: "pending" })],
    });
    const result = validateDirectory(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/samo advanced|mora biti verified/);
    expect(result.errors.join("\n")).toMatch(/probne vožnje|kandidat za pasoš/);
    expect(result.errors.join("\n")).toMatch(/assigned_at i assigned_by/);
  });

  test("does not resolve a model relation across events", () => {
    const dir = fixture({
      "03-models.csv": [line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", stand_external_key: "s1", model_external_key: "isti-model", display_name: "M", price_text: "Cena na upit", price_confirmed: "no", package_tier: "included", package_active_from: "2026-10-01T10:00:00Z", passport_eligible: "no", publication_status: "draft" })],
      "04-specifications.csv": [line("04-specifications.csv", { event_code: "auto-moto-fest-2026", model_external_key: "isti-model", display_order: "1", label: "Snaga", value: "100 kW", verified: "yes" })],
    });
    expect(validateDirectory(dir).errors.join("\n")).toMatch(/ne postoji u istom događaju/);
  });

  test("rejects malformed CSV, wrong column count and invalid timestamp", () => {
    const malformed = fixture();
    fs.writeFileSync(path.join(malformed, "01-exhibitors.csv"), `${headers["01-exhibitors.csv"].join(",")}\n"nezatvoreno\n`, "utf8");
    expect(validateDirectory(malformed).errors.join("\n")).toMatch(/neispravan CSV.*unterminated quoted field/);

    const wrongColumns = fixture({
      "03-models.csv": ["elektromobilnost-2026,p1,b1,s1,m1,premalo-kolona"],
    });
    expect(validateDirectory(wrongColumns).errors.join("\n")).toMatch(/očekivano 18 kolona/);

    const badTime = fixture({
      "03-models.csv": [line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", stand_external_key: "s1", model_external_key: "m1", display_name: "M", price_text: "Cena na upit", price_confirmed: "no", package_tier: "included", package_active_from: "2026-13-99T25:61:00", passport_eligible: "no", publication_status: "draft" })],
    });
    expect(validateDirectory(badTime).errors.join("\n")).toMatch(/package_active_from nije validan ISO datum\/vreme/);
  });

  test("published model requires map location, verified specification and verified active QR", () => {
    const dir = fixture({
      "01-exhibitors.csv": [line("01-exhibitors.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", exhibitor_name: "Ex", client_segment: "event_only" })],
      "02-brands-stands.csv": [line("02-brands-stands.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", brand_name: "B", stand_external_key: "s1", stand_code: "S1" })],
      "03-models.csv": [line("03-models.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", brand_external_key: "b1", stand_external_key: "s1", model_external_key: "m1", display_name: "M", price_text: "12.000 EUR", price_confirmed: "yes", package_tier: "starter", package_active_from: "2026-10-01T10:00:00Z", passport_eligible: "no", publication_status: "published" })],
      "04-specifications.csv": [line("04-specifications.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", display_order: "1", label: "Snaga", value: "100 kW", verified: "no" })],
      "08-qr-assignments.csv": [line("08-qr-assignments.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", resolver_code: "QR-1", printed_label_id: "label-1", assignment_status: "active", assigned_at: "2026-10-01T10:00:00Z", assigned_by: "Aleksa", verification_status: "pending" })],
    });
    const errors = validateDirectory(dir).errors.join("\n");
    expect(errors).toMatch(/najmanje jednu proverenu specifikaciju/);
    expect(errors).toMatch(/validan map_location_id/);
    expect(errors).toMatch(/tačno jedan aktivan i verifikovan QR/);
  });

  test("rejects globally reused QR codes, duplicate choices and malformed emails", () => {
    const dir = fixture({
      "01-exhibitors.csv": [line("01-exhibitors.csv", { event_code: "elektromobilnost-2026", participation_external_key: "p1", exhibitor_name: "Ex", client_segment: "event_only", report_email: "nije-email" })],
      "05-audience-questions.csv": [line("05-audience-questions.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", event_day: "2026-10-09", question_external_key: "q1", display_order: "1", question_text: "Q", option_1: "Isto", option_2: "isto", use_in_sponsored_rotation: "no", publication_status: "draft" })],
      "08-qr-assignments.csv": [
        line("08-qr-assignments.csv", { event_code: "elektromobilnost-2026", model_external_key: "m1", resolver_code: "QR-1", printed_label_id: "label-1", assignment_status: "pending", verification_status: "pending" }),
        line("08-qr-assignments.csv", { event_code: "auto-moto-fest-2026", model_external_key: "m2", resolver_code: "QR-1", printed_label_id: "label-2", assignment_status: "pending", verification_status: "pending" }),
      ],
    });
    const errors = validateDirectory(dir).errors.join("\n");
    expect(errors).toMatch(/duplikat QR kod/);
    expect(errors).toMatch(/ponuđene opcije moraju biti različite/);
    expect(errors).toMatch(/report_email nije validna email adresa/);
  });
});
