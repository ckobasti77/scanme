// @vitest-environment node
// Ubrzan raycast velikih mreža (A12) mora da daje isti najbliži pogodak kao three `intersectObject`:
// gusta mreža (torus kao guma), sve tri strane materijala, transformacija čvora, presek (accept) i far.

import { BackSide, DoubleSide, FrontSide, Mesh, MeshBasicMaterial, Raycaster, TorusGeometry, Vector3, type Side } from "three";
import { describe, expect, test } from "vitest";
import { nearestHit } from "./mesh-ray";

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function tire(side: Side): Mesh {
  // 64 × 96 × 2 = 12.288 trouglova: iznad praga, pa ide ubrzan put.
  const mesh = new Mesh(new TorusGeometry(0.35, 0.12, 64, 96), new MeshBasicMaterial({ side }));
  mesh.position.set(0.8, 0.36, 1.4);
  mesh.rotation.set(0.2, Math.PI / 2, 0);
  mesh.scale.setScalar(1.1);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe("nearestHit", () => {
  for (const [name, side] of [
    ["DoubleSide", DoubleSide],
    ["FrontSide", FrontSide],
    ["BackSide", BackSide],
  ] as const) {
    test(`isti pogodak kao three (${name})`, () => {
      const mesh = tire(side);
      const random = rng(7);
      const raycaster = new Raycaster();
      let hits = 0;
      for (let i = 0; i < 300; i++) {
        const origin = new Vector3(random() * 6 - 3, random() * 3, random() * 6 - 3 + 1.4);
        const target = new Vector3(0.8 + (random() - 0.5) * 0.9, 0.36 + (random() - 0.5) * 0.9, 1.4 + (random() - 0.5) * 0.9);
        raycaster.set(origin, target.sub(origin).normalize());
        const sectionX = random() < 0.3 ? 0.8 : null;
        const accept = sectionX === null ? undefined : (p: Vector3) => p.x <= sectionX;
        const ref = raycaster.intersectObject(mesh, false).find((h) => !accept || accept(h.point)) ?? null;
        const got = nearestHit(raycaster, mesh, accept);
        if (!ref) {
          expect(got).toBeNull();
          continue;
        }
        hits++;
        expect(got).not.toBeNull();
        expect(got!.distance).toBeCloseTo(ref.distance, 6);
        expect(got!.point.distanceTo(ref.point)).toBeLessThan(1e-6);
      }
      expect(hits).toBeGreaterThan(50);
    });
  }

  test("poštuje far zraka (provera ugla kamere)", () => {
    const mesh = tire(DoubleSide);
    const raycaster = new Raycaster(new Vector3(0.8, 0.36, -2), new Vector3(0, 0, 1));
    expect(nearestHit(raycaster, mesh)).not.toBeNull();
    raycaster.far = 1;
    expect(nearestHit(raycaster, mesh)).toBeNull();
    expect(raycaster.intersectObject(mesh, false)).toEqual([]);
  });
});
