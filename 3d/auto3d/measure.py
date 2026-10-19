"""Meri limuzinu iz scene i poredi sa PLAN §3 (A01 §1.7).

  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/measure.py -- [--strict]

Piše output/auto3d/measure.json i tabelu `MERA ...`. Sa --strict vraća grešku ako nešto padne.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from config import dims as D  # noqa: E402
from lib import cage, scene, views  # noqa: E402

TOL = 0.02
GAP_PAIRS = [
    ("hauba", "blatobran__l"), ("blatobran__l", "vrata_prednja__l"), ("vrata_prednja__l", "vrata_zadnja__l"),
    ("vrata_zadnja__l", "skelet"), ("vrata_prednja__l", "prag__l"), ("poklopac_prtljaznika", "skelet"),
    ("krov", "skelet"), ("branik_prednji", "blatobran__l"), ("branik_zadnji", "skelet"),
]


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    return ap.parse_args(argv)


def obj(name: str):
    for o in bpy.data.objects:
        if o.name.startswith("part__") and o.name.endswith("__" + name) or o.name.split("__", 2)[-1] == name:
            return o
    raise KeyError(name)


def pts(o) -> list[Vector]:
    return views.node_points(o)


def boundary_points(o) -> list[Vector]:
    bm = bmesh.new()
    bm.from_mesh(o.data)
    mw = o.matrix_world
    out = []
    for v in bm.verts:
        if v.is_boundary:
            out.append(Vector(scene.to_vehicle(mw @ v.co)))
    bm.free()
    return out


_EDGES: dict | None = None


def edge_points(o) -> list[Vector]:
    """Spoljna ivica panela posle uvlačenja (gap_edges.json iz body/shell.py), inače sva granična temena.

    Granična temena uključuju i vrh povratne prirubnice, koji je na ispupčenom pregibu bliži susednom
    panelu od vidljive fuge, pa bi medijana bila prekratka (A06).
    """
    global _EDGES
    if _EDGES is None:
        f = scene.OUT / "gap_edges.json"
        _EDGES = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {}
    if o.name in _EDGES:
        return [Vector(p) for p in _EDGES[o.name]]
    return boundary_points(o)


def min_gap(a, b) -> float:
    pa, pb = edge_points(a), edge_points(b)
    if not pa or not pb:
        return float("nan")
    from mathutils.kdtree import KDTree

    kd = KDTree(len(pb))
    for i, p in enumerate(pb):
        kd.insert(p, i)
    kd.balance()
    ds = sorted(kd.find(p)[2] for p in pa)
    close = [d for d in ds if d < 0.02]
    return close[len(close) // 2] if close else float("nan")


def main() -> None:
    args = parse()
    karo = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(("part__karoserija", "part__elektrika"))]
    body_no_mirror = [p for o in karo if "retrovizor" not in o.name for p in pts(o)]
    body_all = [p for o in karo for p in pts(o)]
    panels = [o for o in karo if not any(k in o.name for k in ("retrovizor", "far", "stop_svetlo", "led_traka", "maska", "staklo", "vetrobran", "ecu", "kablovski"))]
    panel_pts = [p for o in panels for p in pts(o)]
    mn, mx = views.bbox(body_no_mirror)
    fl = obj("felna_prednja__l").matrix_world.translation
    fr = obj("felna_prednja__d").matrix_world.translation
    rl = obj("felna_zadnja__l").matrix_world.translation
    rr = obj("felna_zadnja__d").matrix_world.translation
    z_f, z_r = -fl.y, -rl.y

    def tire(name):
        tp = pts(obj(name))
        a, b = views.bbox(tp)
        return a, b, tp

    tfa, tfb, tfp = tire("guma_prednja__l")
    tra, trb, trp = tire("guma_zadnja__l")
    clearance = min(p.y for p in panel_pts if abs(p.z) < 1.0)
    ws = pts(obj("vetrobran"))
    ws_low = min(p.y for p in ws)
    ws_base = [p for p in ws if p.y < ws_low + 0.02]
    a_base = max(ws_base, key=lambda p: abs(p.x))
    center = [p for p in ws if abs(p.x) < 0.03]
    c_lo, c_hi = min(center, key=lambda p: p.y), max(center, key=lambda p: p.y)
    ws_angle = math.degrees(math.atan2(abs(c_hi.z - c_lo.z), abs(c_hi.y - c_lo.y)))
    belt = min(p.y for p in pts(obj("bocna_stakla__l")))

    def arch_gap(front: bool) -> float:
        zc, yc, rt = (z_f, D.Y_WHEEL_F, D.TIRE_R_F) if front else (z_r, D.Y_WHEEL_R, D.TIRE_R_R)
        best = 9.0
        for o in panels:
            for p in pts(o):
                if abs(p.x) < 0.80 or p.y < yc:
                    continue
                ang = math.degrees(math.atan2(p.z - zc, p.y - yc))
                if abs(ang) > 30:
                    continue
                best = min(best, math.hypot(p.z - zc, p.y - yc) - rt)
        return best

    def face_inboard(front: bool) -> float:
        zc = z_f if front else z_r
        tface = (tfb.x if front else trb.x)
        body_x = max(p.x for p in panel_pts if abs(p.z - zc) < 0.45 and 0.4 < p.y < 0.9)
        return body_x - tface

    m = {
        "duzina": (mx.z - mn.z, D.LENGTH),
        "sirina": (2 * max(abs(mn.x), abs(mx.x)), D.WIDTH),
        "sirina_retrovizori": (2 * max(abs(p.x) for p in body_all), D.WIDTH_MIRRORS),
        "visina": (mx.y, D.HEIGHT),
        "medjuosovinsko": (z_f - z_r, D.WHEELBASE),
        "prepust_napred": (mx.z - z_f, D.OVERHANG_F),
        "prepust_pozadi": (z_r - mn.z, D.OVERHANG_R),
        "trag_napred": (fl.x - fr.x, D.TRACK_F),
        "trag_pozadi": (rl.x - rr.x, D.TRACK_R),
        "klirens": (clearance, D.CLEARANCE),
        "guma_napred_precnik": (tfb.z - tfa.z, 2 * D.TIRE_R_F),
        "guma_pozadi_precnik": (trb.z - tra.z, 2 * D.TIRE_R_R),
        "dash_to_axle": (z_f - a_base.z, 1.00),
        "linija_ramena": (belt, 0.96),
    }
    rows = {}
    ok_all = True
    for k, (val, goal) in m.items():
        ok = abs(val - goal) <= TOL * goal
        ok_all &= ok
        rows[k] = {"vrednost": round(val, 4), "cilj": goal, "ok": ok}
    # zadnje staklo i poklopac (napomena nadzora 17. 10.): nagib 25–30° od horizontale, paluba 0,45–0,55 m
    rg = pts(obj("zadnje_staklo"))
    rg_c = [p for p in rg if abs(p.x) < 0.03]
    rg_lo, rg_hi = min(rg_c, key=lambda p: p.y), max(rg_c, key=lambda p: p.y)
    rg_angle = math.degrees(math.atan2(abs(rg_hi.y - rg_lo.y), abs(rg_hi.z - rg_lo.z)))
    lid = [p for p in pts(obj("poklopac_prtljaznika")) if abs(p.x) < 0.03 and p.y > 1.0]
    deck = rg_lo.z - min(p.z for p in lid)
    ranges = {
        "nagib_vetrobrana_deg": (ws_angle, 60.0, 63.0),
        "nagib_zadnjeg_stakla_deg": (rg_angle, 25.0, 30.0),
        "paluba_poklopca_m": (deck, 0.45, 0.55),
        "razmak_luk_napred_mm": (arch_gap(True) * 1000, 25.0, 35.0),
        "razmak_luk_pozadi_mm": (arch_gap(False) * 1000, 25.0, 35.0),
        "guma_unutra_napred_mm": (face_inboard(True) * 1000, 2.0, 15.0),
        "guma_unutra_pozadi_mm": (face_inboard(False) * 1000, 2.0, 15.0),
        "guma_na_podu_mm": (min(p.y for p in tfp + trp) * 1000, -1.0, 1.0),
        "belt_kroz_visinu": (belt / mx.y, 0.64, 0.69),
        "guma_kroz_visinu": ((tfb.z - tfa.z) / mx.y, 0.48, 0.60),
    }
    for k, (val, lo, hi) in ranges.items():
        ok = lo <= val <= hi
        ok_all &= ok
        rows[k] = {"vrednost": round(val, 3), "opseg": [lo, hi], "ok": ok}
    gaps = {}
    for a, b in GAP_PAIRS:
        try:
            g = min_gap(obj(a), obj(b)) * 1000
        except KeyError:
            g = float("nan")
        gaps[f"{a}|{b}"] = round(g, 2) if g == g else None
        ok = g == g and 4.0 <= g <= 5.0
        ok_all &= ok
        rows[f"fuga {a}|{b}_mm"] = {"vrednost": gaps[f"{a}|{b}"], "opseg": [4.0, 5.0], "ok": ok}
    for k, r in rows.items():
        cilj = r.get("cilj", r.get("opseg"))
        print(f"MERA {k:38s} {r['vrednost']!s:>10} cilj {cilj!s:>14} {'PROŠLO' if r['ok'] else 'PALO'}", flush=True)
    (scene.OUT / "measure.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"MERA ukupno: {'PROŠLO' if ok_all else 'PALO'}", flush=True)
    if args.strict and not ok_all:
        raise SystemExit(1)
    _ = cage


main()
