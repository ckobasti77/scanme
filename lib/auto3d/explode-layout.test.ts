// @vitest-environment node
// Koreografija rasklapanja i fokus (A08). Pravila su ona koja je `3d/auto3d/collide.py --motion`
// potvrdio (0 prolaza dubljih od 5 mm u 120 koraka); test čuva da se tempo i smerovi ne pokvare.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { FILES, PUBLIC_DIR } from "./budgets";
import type { PartId } from "./catalog";
import { parseManifest, type ManifestPart } from "./manifest";

const manifest = parseManifest(JSON.parse(readFileSync(resolve(process.cwd(), PUBLIC_DIR, FILES.manifest), "utf8")));
const byId = new Map(manifest.parts.map((p) => [p.id, p] as const));
const part = (id: PartId): ManifestPart => {
  const p = byId.get(id);
  if (!p) throw new Error(`nema dela ${id}`);
  return p;
};
const primary = (id: PartId) => part(id).nodes.find((n) => n.name === part(id).primary) ?? part(id).nodes[0];

describe("rasklapanje (A08)", () => {
  test("na mestu ostaju samo školjka, blok, snop, rezervoar i obloga usisa i izduva oko bloka", () => {
    const still = manifest.parts.filter((p) => p.nodes.every((n) => n.explode.dist === 0)).map((p) => p.id).sort();
    expect(still).toEqual(["blok_motora", "izduvna_grana", "kablovski_snop", "rezervoar", "skelet", "usisne_cevi"]);
  });

  test("desna instanca je ogledalo leve (smer i ugao fokusa)", () => {
    for (const p of manifest.parts) {
      const l = p.nodes.find((n) => n.instance === "l");
      const d = p.nodes.find((n) => n.instance === "d");
      if (!l || !d) continue;
      expect(d.explode.dir[0]).toBeCloseTo(-l.explode.dir[0], 4);
      expect(d.explode.dir[1]).toBeCloseTo(l.explode.dir[1], 4);
      expect(d.explode.dir[2]).toBeCloseTo(l.explode.dir[2], 4);
      expect(d.explode.dist).toBe(l.explode.dist);
      expect(d.focus.az).toBeCloseTo(-l.focus.az, 4);
    }
  });

  test("točak i guma izlaze pre diska i čeljusti, čeljust se odvaja radijalno od diska", () => {
    for (const axle of ["prednj", "zadnj"] as const) {
      const felna = part(`felna_${axle}a` as PartId);
      const guma = part(`guma_${axle}a` as PartId);
      const disk = part(`disk_${axle}i` as PartId);
      const celjust = part(`celjust_${axle}a` as PartId);
      expect(felna.stage).toBeLessThan(disk.stage);
      expect(guma.stage).toBeLessThan(disk.stage);
      expect(celjust.stage).toBe(disk.stage);
      const c = primary(celjust.id).explode;
      const k = primary(disk.id).explode;
      // komponenta duž osovine (x) jednaka je disku: relativno kretanje je samo u ravni diska
      expect(c.dir[0] * c.dist).toBeCloseTo(k.dir[0] * k.dist, 2);
    }
  });

  test("izduv ide pre podokvira, a zadnji kardan posle zadnjeg podokvira", () => {
    for (const id of ["gpf", "srednji_lonac", "zadnji_lonac"] as const) {
      expect(part(id).stage).toBeLessThan(part("podokvir_zadnji").stage);
      expect(primary(id).explode.dir[1]).toBeLessThan(0);
    }
    expect(part("kardan_zadnji").stage).toBeGreaterThan(part("podokvir_zadnji").stage);
  });

  test("enterijer ide gore (kroz otvor krova), nikad dole", () => {
    for (const id of ["sediste_prednje", "zadnja_klupa", "tabla", "volan", "konzola"] as const) {
      expect(primary(id).explode.dir[1]).toBeGreaterThan(0.85);
    }
  });

  test("prednji amortizer izlazi pre ramena, letva i stabilizator posle ramena", () => {
    expect(part("amortizer_prednji").stage).toBeLessThan(part("ramena_prednja").stage);
    expect(part("letva_volana").stage).toBeGreaterThan(part("ramena_prednja").stage);
    expect(part("stabilizator_prednji").stage).toBeGreaterThan(part("ramena_prednja").stage);
  });
});

describe("fokus kamere (A08)", () => {
  test("svaki čvor ima smislen ugao i daljinu", () => {
    for (const p of manifest.parts) {
      for (const n of p.nodes) {
        expect(n.focus.az, n.name).toBeGreaterThanOrEqual(-180);
        expect(n.focus.az, n.name).toBeLessThanOrEqual(180);
        expect(Math.abs(n.focus.el), n.name).toBeLessThan(80);
        expect(n.focus.dist, n.name).toBeGreaterThan(0);
        expect(n.focus.dist, n.name).toBeLessThanOrEqual(4.5);
      }
    }
  });

  test("delovi ispod poda se gledaju odozdo, enterijer i vrh motora odozgo", () => {
    for (const id of ["karter", "katalizator", "gpf", "srednji_lonac", "menjac", "prenosna_kutija", "kardan_zadnji", "podokvir_prednji"] as const) {
      expect(primary(id).focus.el, id).toBeLessThan(0);
    }
    for (const id of ["tabla", "konzola", "poklopac_ventila", "pumpa_goriva", "sediste_prednje"] as const) {
      expect(primary(id).focus.el, id).toBeGreaterThan(20);
    }
  });
});
