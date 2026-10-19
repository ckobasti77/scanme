// @vitest-environment node
// Kontakt u sekciji paketa mora da bude isti javni kontakt kao u components/offer-footer.tsx (PLAN P11):
// drugi brojevi se ne izmišljaju. Test čita podnožje ponude kao tekst i poredi telefon i email.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PARTS } from "@/lib/auto3d/catalog";
import { fairAuto3dSr } from "@/lib/i18n/sr/fair-auto3d";

const t = fairAuto3dSr.packages;
const footer = readFileSync(join(process.cwd(), "components", "offer-footer.tsx"), "utf8");

describe("kontakt u paketima = kontakt iz podnožja ponude (P11)", () => {
  test("telefon: prikaz, ime i tel: adresa", () => {
    expect(footer).toContain(`${t.contactPhone} (${t.contactPerson})`);
    expect(footer).toContain(`href="${t.contactPhoneHref}"`);
  });

  test("email: prikaz i mailto: adresa", () => {
    expect(footer).toContain(`href="${t.contactEmailHref}"`);
    expect(footer).toContain(t.contactEmail);
    expect(t.contactEmailHref).toBe(`mailto:${t.contactEmail}`);
  });
});

describe("docs/auto3d/PRODAJA-3D-RENDGEN.md (A11)", () => {
  const doc = readFileSync(join(process.cwd(), "docs", "auto3d", "PRODAJA-3D-RENDGEN.md"), "utf8").replace(/\r\n/g, "\n");
  const section = (title: string) => doc.split(/^## /m).find((part) => part.startsWith(title)) ?? "";
  const numbered = (text: string) => (text.match(/^\*\*\d+\. /gm) ?? []).length;

  test("ima sve odeljke iz zadatka", () => {
    for (const title of ["1. Pitch", "2. Šta izlagač dobija", "3. Cena", "4. Šta nam treba", "5. Predlog roka", "6. Osam čestih pitanja", "7. Pet prigovora", "8. Linkovi za demo"]) {
      expect(section(title), title).not.toBe("");
    }
  });

  test("8 pitanja, 5 prigovora, rok označen kao predlog", () => {
    expect(numbered(section("6."))).toBe(8);
    expect(numbered(section("7."))).toBe(5);
    expect(section("5.")).toContain("predlog, nije dogovoren rok");
  });

  test("cene i demo linkovi, tri linka na delove koji postoje", () => {
    expect(section("3.")).toContain("8.000 RSD");
    expect(section("3.")).toContain("5.000 RSD");
    const links = section("8.");
    for (const link of ["`/sajam/3d`", "?tura=1", "?kiosk=1"]) expect(links).toContain(link);
    const parts = [...links.matchAll(/\?deo=([a-z0-9_]+)/g)].map((m) => m[1]);
    expect(parts).toHaveLength(3);
    for (const id of parts) expect(PARTS.some((p) => p.id === id), id).toBe(true);
  });
});
