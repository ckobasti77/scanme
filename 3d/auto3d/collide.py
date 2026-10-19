"""Provera prodiranja delova i spisak detalja (A01 §1.8, §2.4; A08).

  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/collide.py -- [--motion [--steps 40]] [--inventory] [--strict]

Statički: preseci trouglova (BVHTree.overlap) između svih delova mehanike i enterijera, i između
njih i karoserije (paneli, stakla, `deco__karoserija__pod`). Za svaki par se računa dubina:
za svaki par trouglova koji se seku, koliko jedan trougao prelazi ravan drugog (manja od dve
strane), pa manja od dve vrednosti za par trouglova; dubina para je najveća takva vrednost.
Okrznuće crevom daje par milimetara, a cev kroz ploču ili deo kroz deo daje centimetre.

Par iz config/contacts.py je namerni spoj (prirubnica, vratilo u ležištu, kleme) i ne računa se
kao sudar. Ostali parovi: dubina > 5 mm je SUDAR, do 5 mm je DODIR (spisak, nije greška).

--motion uzorkuje rasklapanje p = 0.05 … 1.0: par koji se u p ne seče, a sekao se ranije, ili
čija je dubina veća od dubine u sklopljenom stanju za više od 5 mm, „leti kroz“ drugi deo.
--strict vraća kod 1 ako postoji SUDAR (statički ili u kretanju).
Piše output/auto3d/collide.json.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

from config.contacts import BODY_CONTACTS, CONTACTS  # noqa: E402
from lib import parts as P  # noqa: E402
from lib import scene, views  # noqa: E402

LIMIT = 0.005  # sudar: dubina veća od 5 mm
SAMPLES = (0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.0)


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--motion", action="store_true")
    ap.add_argument("--inventory", action="store_true")
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--steps", type=int, default=0, help="broj jednakih koraka rasklapanja (podrazumevano 11 uzoraka)")
    return ap.parse_args(argv)


class Body:
    def __init__(self, o: bpy.types.Object) -> None:
        self.obj = o
        bits = o.name.split("__")
        self.part = bits[2]
        self.system = bits[1]
        self.is_body = self.system == "karoserija"
        me = o.data
        me.calc_loop_triangles()
        self.local = [v.co.copy() for v in me.vertices]
        self.tris = [tuple(t.vertices) for t in me.loop_triangles]
        self.cache_key = None
        self.cache = None

    def tree(self):
        mw = self.obj.matrix_world
        key = tuple(round(c, 6) for c in mw.translation)
        if key != self.cache_key:
            verts = [mw @ v for v in self.local]
            mn = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
            mx = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
            self.cache = (BVHTree.FromPolygons(verts, self.tris, all_triangles=True), verts, (mn, mx))
            self.cache_key = key
        return self.cache


def hit(a, b) -> bool:
    return all(a[0][i] <= b[1][i] and b[0][i] <= a[1][i] for i in range(3))


def _poke(tri_a, tri_b) -> float:
    """Koliko trougao a prelazi ravan trougla b (manja od dve strane)."""
    p0, p1, p2 = tri_b
    n = (p1 - p0).cross(p2 - p0)
    if n.length < 1e-12:
        return 0.0
    n.normalize()
    d = [(q - p0).dot(n) for q in tri_a]
    hi, lo = max(d), min(d)
    if hi <= 0.0 or lo >= 0.0:
        return 0.0
    return min(hi, -lo)


def depth(a: Body, b: Body, pairs):
    """Dubina para i mesto (prostor vozila) najdubljeg preseka."""
    _, va, _ = a.tree()
    _, vb, _ = b.tree()
    best, where = 0.0, None
    for ia, ib in pairs:
        ta = [va[i] for i in a.tris[ia]]
        tb = [vb[i] for i in b.tris[ib]]
        d = min(_poke(ta, tb), _poke(tb, ta))
        if d > best or where is None:
            best, where = max(best, d), (ta[0] + ta[1] + ta[2]) / 3
    return best, where


def allowed(a: Body, b: Body) -> bool:
    key = frozenset((a.part, b.part))
    return key in (BODY_CONTACTS if (a.is_body or b.is_body) else CONTACTS)


def check(bodies: list[Body], label: str, skip=None) -> list[dict]:
    out = []
    built = [(b, *b.tree()) for b in bodies]
    for i in range(len(built)):
        bi, ti, _, boxi = built[i]
        for j in range(i + 1, len(built)):
            bj, tj, _, boxj = built[j]
            if bi.part == bj.part or (bi.is_body and bj.is_body):
                continue
            if skip is not None and skip(bi, bj):
                continue
            if not hit(boxi, boxj):
                continue
            pairs = ti.overlap(tj)
            if not pairs:
                continue
            d, w = depth(bi, bj, pairs)
            ok = allowed(bi, bj)
            kind = "dozvoljen" if ok else ("sudar" if d > LIMIT else "dodir")
            wv = [round(c, 3) for c in scene.to_vehicle(w)] if w is not None else None
            out.append({"a": bi.obj.name, "b": bj.obj.name, "preseka": len(pairs), "dubina_mm": round(d * 1000, 1), "vrsta": kind, "stanje": label, "mesto": wv})
    return out


def main() -> None:
    args = parse()
    objs = [o for o in P.part_objects() if o.type == "MESH"]
    floor = bpy.data.objects.get("deco__karoserija__pod")
    bodies = [Body(o) for o in objs]
    if floor is not None:
        fb = Body(floor)
        fb.part = "pod"
        bodies.append(fb)
    mech = [b for b in bodies if not b.is_body]
    report: dict = {"granica_mm": LIMIT * 1000}
    rows = check(bodies, "sklopljen")
    report["staticki"] = [r for r in rows if r["a"].split("__")[1] != "karoserija" and r["b"].split("__")[1] != "karoserija"]
    report["kroz_karoseriju"] = [r for r in rows if r not in report["staticki"]]
    if args.motion:
        base = {(r["a"], r["b"]): r["dubina_mm"] for r in rows}
        moving = []
        ex = views.Exploder()
        samples = [round(k / args.steps, 4) for k in range(1, args.steps + 1)] if args.steps else SAMPLES
        for p in samples:
            ex.apply(p)
            for r in check(bodies, f"p={p}"):
                d0 = base.get((r["a"], r["b"]))
                if d0 is None:
                    r["vrsta"] = "kroz" if r["dubina_mm"] > LIMIT * 1000 else "okrzne"
                elif r["dubina_mm"] > d0 + LIMIT * 1000:
                    r["vrsta"] = "kroz"
                else:
                    continue
                moving.append(r)
        ex.reset()
        report["kretanje"] = moving
    if args.inventory:
        inv = {}
        names = {o.name for o in objs}
        inv["retrovizori"] = sum(1 for n in names if "retrovizor" in n)
        inv["brisaci"] = int(bool(bpy.data.objects.get("deco__karoserija__brisaci")))
        for lamp in ("far__l", "far__d", "stop_svetlo__l", "stop_svetlo__d"):
            o = next(o for o in objs if o.name.endswith(lamp))
            inv[lamp] = sorted({m.name for m in o.data.materials if m})
        report["inventar"] = inv
    fail = 0
    for k in ("staticki", "kroz_karoseriju", "kretanje"):
        rows_k = report.get(k)
        if rows_k is None:
            continue
        bad = [r for r in rows_k if r["vrsta"] in ("sudar", "kroz")]
        soft = [r for r in rows_k if r["vrsta"] in ("dodir", "okrzne")]
        ok = [r for r in rows_k if r["vrsta"] == "dozvoljen"]
        fail += len(bad)
        worst = max((r["dubina_mm"] for r in bad + soft), default=0.0)
        print(f"SUDAR {k}: {len(bad)} sudara > {LIMIT * 1000:.0f} mm, {len(soft)} dodira <= {LIMIT * 1000:.0f} mm, {len(ok)} dozvoljenih spojeva; najdublje van spojeva {worst} mm", flush=True)
        for r in sorted(bad + soft, key=lambda r: -r["dubina_mm"])[:60]:
            print(f"SUDAR   {r['vrsta']:6s} {r['stanje']:10s} {r['a']} <-> {r['b']} ({r['preseka']} preseka, {r['dubina_mm']} mm, kod {r['mesto']})", flush=True)
    if "inventar" in report:
        print(f"SUDAR inventar: {report['inventar']}", flush=True)
    report["mehanike"] = len(mech)
    (scene.OUT / "collide.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    if args.strict and fail:
        raise SystemExit(f"collide: {fail} sudara dublja od {LIMIT * 1000:.0f} mm")


main()
