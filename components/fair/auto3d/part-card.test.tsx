// Kartica dela (A05): deo bez instanci i deo sa dve instance, prethodni i sledeći u krug, skrivena
// polja forme (grupa, režim) i napomena o primeru vrednosti (P3).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { partsOfSystem } from "@/lib/auto3d/groups";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { PartCard } from "./part-card";

describe("kartica dela", () => {
  test("hauba: bez ×2, prethodni je poslednji deo karoserije (u krug)", () => {
    const html = renderToStaticMarkup(<PartCard part="hauba" group={null} mode="rendgen" />);
    const karoserija = partsOfSystem("karoserija");
    expect(html).toContain(delovi.parts.hauba.name);
    expect(html).toContain(delovi.systems.karoserija.name);
    expect(html).not.toContain(t.instancesTwo);
    const values = [...html.matchAll(/<button type="submit" value="([a-z0-9_]+)"[^>]*name="deo"/g)].map((m) => m[1]);
    expect(values).toEqual([karoserija[karoserija.length - 1], karoserija[1]]);
    expect(html).toContain(`1 od ${karoserija.length}`);
    expect(html).not.toContain('type="hidden"');
    expect(html).toContain(`<caption>${t.cardSpecs}</caption>`);
    expect((html.match(/<th scope="row">/g) ?? []).length).toBe(delovi.parts.hauba.specs.length);
    expect(html).toContain(t.exampleNote);
    // Bez onClose nema dugmeta za zatvaranje (server, telefon dobija X kroz panel).
    expect(html).not.toContain(t.selectedClose.replace("{name}", delovi.parts.hauba.name));
  });

  test("disk_prednji: ×2 sa tekstom za čitače, grupa i režim u formi, X za zatvaranje", () => {
    const html = renderToStaticMarkup(<PartCard part="disk_prednji" group="kocnice" mode="lak" onClose={() => {}} />);
    expect(html).toContain(`<span aria-hidden="true">${t.instancesTwo}</span>`);
    expect(html).toContain(t.instancesTwoLong);
    expect(html).toContain('<input type="hidden" name="grupa" value="kocnice"/>');
    expect(html).toContain('<input type="hidden" name="rezim" value="lak"/>');
    expect(html).toContain(t.selectedClose.replace("{name}", delovi.parts.disk_prednji.name));
    expect(html).toContain(`aria-label="${t.cardPrevAria.replace("{name}", delovi.parts.guma_zadnja.name)}"`);
    expect(html).toContain(`aria-label="${t.cardNextAria.replace("{name}", delovi.parts.disk_zadnji.name)}"`);
  });
});
