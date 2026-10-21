// ScanMe Menu V1 (K25) — what a venue's reservation settings mean
// (lib/menu/reservation-config.ts; master §11.1, §11.2, §11.6): off, the ScanMe
// form (only with working hours) or a link to the venue's own system.
// Invented venues only.

import { describe, expect, test } from "vitest";
import {
  DEFAULT_RESERVATION_CONTACT,
  acceptsFormRequests,
  publicReservationEntry,
  reservationConfigOf,
  type ReservationConfig,
} from "./reservation-config";
import { emptyWorkingHours, intervalFromInput, type WorkingHours } from "./working-hours";

const evening = intervalFromInput("18:00", "23:00");
if (!evening) throw new Error("bad interval");
const HOURS: WorkingHours = { days: Array.from({ length: 7 }, (_, index) => (index === 5 ? [{ ...evening }] : [])) };
const LINK = "https://rezervacije.primer.rs/sto";

const config = (over: Partial<ReservationConfig> = {}): ReservationConfig => ({
  mode: "off",
  contact: "both",
  externalUrl: null,
  holdMinutes: 15,
  workingHours: null,
  ...over,
});

describe("reservationConfigOf", () => {
  test("a venue with no settings gets the defaults: contact both, hold 15, no hours, no link", () => {
    const expected = { mode: "off", contact: "both", externalUrl: null, holdMinutes: 15, workingHours: null };
    expect(reservationConfigOf({ reservations: "off" }, undefined)).toEqual(expected);
    expect(reservationConfigOf({ reservations: "off" }, null)).toEqual(expected);
    expect(reservationConfigOf({ reservations: "off" }, {})).toEqual(expected);
    expect(DEFAULT_RESERVATION_CONTACT).toBe("both");
  });

  test("the mode always comes from the features, whatever the settings hold", () => {
    for (const mode of ["off", "form", "external"] as const) {
      expect(reservationConfigOf({ reservations: mode }, undefined).mode).toBe(mode);
    }
  });

  test("the stored contact, link, hold and hours are read", () => {
    expect(
      reservationConfigOf(
        { reservations: "form" },
        { workingHours: HOURS, reservation: { contact: "email", externalUrl: LINK, holdMinutes: 30 } },
      ),
    ).toEqual({ mode: "form", contact: "email", externalUrl: LINK, holdMinutes: 30, workingHours: HOURS });
  });

  test("settings with hours but no reservation block still default the rest", () => {
    expect(reservationConfigOf({ reservations: "form" }, { workingHours: HOURS })).toEqual({
      mode: "form",
      contact: "both",
      externalUrl: null,
      holdMinutes: 15,
      workingHours: HOURS,
    });
  });

  test("a reservation block without a link or a hold uses the default hold and no link", () => {
    const result = reservationConfigOf({ reservations: "form" }, { reservation: { contact: "phone" } });
    expect(result).toMatchObject({ contact: "phone", externalUrl: null, holdMinutes: 15, workingHours: null });
  });

  test("a broken stored hold falls back to 15", () => {
    for (const holdMinutes of [0, 4, 181, 1.5, Number.NaN]) {
      expect(reservationConfigOf({ reservations: "form" }, { reservation: { contact: "both", holdMinutes } }).holdMinutes).toBe(15);
    }
    expect(reservationConfigOf({ reservations: "form" }, { reservation: { contact: "both", holdMinutes: 5 } }).holdMinutes).toBe(5);
    expect(reservationConfigOf({ reservations: "form" }, { reservation: { contact: "both", holdMinutes: 180 } }).holdMinutes).toBe(180);
  });
});

describe("publicReservationEntry", () => {
  test("the form with working hours offers the form, with the contact and the hours", () => {
    expect(publicReservationEntry(config({ mode: "form", contact: "phone", workingHours: HOURS }))).toEqual({
      mode: "form",
      contact: "phone",
      workingHours: HOURS,
    });
  });

  test("the form entry carries nothing else: no link, no hold", () => {
    const entry = publicReservationEntry(config({ mode: "form", workingHours: HOURS, externalUrl: LINK, holdMinutes: 90 }));
    expect(Object.keys(entry).sort()).toEqual(["contact", "mode", "workingHours"]);
  });

  test("the form without working hours offers nothing: null hours and a closed week alike", () => {
    expect(publicReservationEntry(config({ mode: "form", workingHours: null }))).toEqual({ mode: "off" });
    expect(publicReservationEntry(config({ mode: "form", workingHours: emptyWorkingHours() }))).toEqual({ mode: "off" });
  });

  test("an external system with a link offers the link only", () => {
    const entry = publicReservationEntry(config({ mode: "external", externalUrl: LINK, workingHours: HOURS, contact: "email" }));
    expect(entry).toStrictEqual({ mode: "external", url: LINK });
  });

  test("an external system without a link offers nothing, even with working hours", () => {
    expect(publicReservationEntry(config({ mode: "external", externalUrl: null }))).toEqual({ mode: "off" });
    expect(publicReservationEntry(config({ mode: "external", externalUrl: null, workingHours: HOURS }))).toEqual({ mode: "off" });
    expect(publicReservationEntry(config({ mode: "external", externalUrl: "" }))).toEqual({ mode: "off" });
  });

  test("off stays off, whatever else is set", () => {
    expect(publicReservationEntry(config({ mode: "off" }))).toEqual({ mode: "off" });
    expect(publicReservationEntry(config({ mode: "off", workingHours: HOURS, externalUrl: LINK }))).toEqual({ mode: "off" });
  });

  test("it works on what reservationConfigOf produces", () => {
    const settings = { workingHours: HOURS, reservation: { contact: "email" as const } };
    expect(publicReservationEntry(reservationConfigOf({ reservations: "form" }, settings))).toEqual({
      mode: "form",
      contact: "email",
      workingHours: HOURS,
    });
    expect(publicReservationEntry(reservationConfigOf({ reservations: "form" }, undefined))).toEqual({ mode: "off" });
  });
});

describe("acceptsFormRequests", () => {
  test("only the form with at least one open interval takes requests", () => {
    expect(acceptsFormRequests(config({ mode: "form", workingHours: HOURS }))).toBe(true);
  });

  test("the form without hours does not", () => {
    expect(acceptsFormRequests(config({ mode: "form", workingHours: null }))).toBe(false);
    expect(acceptsFormRequests(config({ mode: "form", workingHours: emptyWorkingHours() }))).toBe(false);
  });

  test("external and off do not, even with hours", () => {
    expect(acceptsFormRequests(config({ mode: "external", externalUrl: LINK, workingHours: HOURS }))).toBe(false);
    expect(acceptsFormRequests(config({ mode: "off", workingHours: HOURS }))).toBe(false);
  });

  test("it agrees with the public entry", () => {
    for (const mode of ["off", "form", "external"] as const) {
      for (const workingHours of [null, emptyWorkingHours(), HOURS]) {
        for (const externalUrl of [null, LINK]) {
          const candidate = config({ mode, workingHours, externalUrl });
          expect(acceptsFormRequests(candidate), `${mode} ${workingHours ? "hours" : "no hours"} ${externalUrl ?? "no link"}`).toBe(
            publicReservationEntry(candidate).mode === "form",
          );
        }
      }
    }
  });
});
