"""Felne 21" (10 dvostrukih krakova, konkavno lice, tamni grafit) i gume 255/35 R21 / 285/30 R21.

Grade se u osnom okviru (lokalna +Y = osa točka ka spolja) i postavljaju na levi točak; desni
točak deli mrežu levog uz rotaciju 180° (simetričan dizajn, A01 D5).

A07:
- krakovi su loft preseka (trapez sa oborenim ivicama) od glavčine do oboda; par se spaja kod
  glavčine i razilazi ka obodu, a lice se spušta 40 mm ka glavčini (konkavno);
- guma je okretno telo sa pravim profilom bočnice (zaštita oboda, najšire mesto, rame), četiri
  uzdužna kanala i poprečnim žlebovima na ramenima; na spoljnoj bočnici je reljef „natpisa“ bez
  teksta (nizovi blokova različite širine) i tanak prsten. Materijal je `mat_rubber` (satenski).
"""

from __future__ import annotations

import math
import random

from mathutils import Vector

from config import dims as D
from lib.geo import Geo, axis_to, cylinder, lathe

WHEEL = "mat_wheel"
CONCAVE = 0.040  # krak se spušta 40 mm od oboda ka glavčini (više bi udarilo u čeljust od 6 klipova)
RUBBER = "mat_rubber"
STEEL = "mat_steel"


def _close(profile):
    return list(profile) + [profile[0]]


# --------------------------------------------------------------------------- guma


def _tire_profile(radius: float, hw: float, grooves: bool) -> list[tuple[float, float, str]]:
    """(r, h, oznaka) od unutrašnje do spoljne stope; oznaka 'sh' = rame (poprečni žlebovi)."""
    rb = D.RIM_D / 2
    side = [(rb, 0.86, ""), (rb + 0.006, 0.93, ""), (rb + 0.012, 0.975, ""), (rb + 0.020, 0.985, ""),
            (rb + 0.030, 1.0, ""), (rb + 0.045, 1.0, ""), (rb + 0.060, 0.99, ""), (radius - 0.028, 0.955, ""),
            (radius - 0.016, 0.915, ""), (radius - 0.007, 0.87, "sh"), (radius - 0.002, 0.83, "sh"), (radius, 0.78, "sh")]
    tread = []
    if grooves:
        for c in (-0.42, -0.14, 0.14, 0.42):
            tread += [(radius, c - 0.045, ""), (radius - 0.007, c - 0.036, ""), (radius - 0.007, c + 0.036, ""), (radius, c + 0.045, "")]
    inner = [(r, -h, tag) for r, h, tag in side]
    outer = [(r, h, tag) for r, h, tag in reversed(side)]
    pts = inner + [(r, h, "") for r, h, _ in tread] + outer
    return [(r, h * hw, tag) for r, h, tag in pts]


def tire_axis(radius: float, width: float, lite: bool) -> Geo:
    """Guma kao okretno telo sa poprečnim žlebovima na ramenima (desktop) i reljefom na bočnici."""
    g = Geo()
    hw = width / 2
    prof = _tire_profile(radius, hw, not lite)
    if lite:
        angles = [2 * math.pi * i / 64 for i in range(64)]
        groove = [False] * 64
    else:
        pitch = 2 * math.pi / 60
        angles, groove = [], []
        for k in range(60):
            a0 = k * pitch
            for f, gr in ((0.0, False), (0.05, True), (0.17, True), (0.22, False), (0.62, False)):
                angles.append(a0 + f * pitch)
                groove.append(gr)
    rings = []
    for a, gr in zip(angles, groove):
        ca, sa = math.cos(a), math.sin(a)
        ring = []
        for r, h, tag in prof:
            rr = r - (0.0035 if gr and tag == "sh" else 0.0)  # plitki poprečni žlebovi (letnja guma, ne „kramponi“)
            ring.append(g.v((rr * ca, h, -rr * sa)))
        rings.append(ring)
    n, m = len(rings), len(prof)
    for i in range(n):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(m - 1):
            g.f((A[j], B[j], B[j + 1], A[j + 1]), RUBBER, None, False)
    if not lite:
        g += sidewall_relief(hw)
    return g


def sidewall_relief(hw: float) -> Geo:
    """Reljef bez teksta na spoljnoj bočnici: dva luka blokova različite širine i tanak prsten."""
    g = Geo()
    rb = D.RIM_D / 2
    rnd = random.Random(21)
    r0, r1 = rb + 0.040, rb + 0.056
    h = hw * 1.0 + 0.0008  # bočnica je najšira oko r0..r1

    def block(a0: float, a1: float, ra: float, rb_: float, dh: float) -> None:
        pts = []
        for a in (a0, a1):
            for r in (ra, rb_):
                pts.append((r * math.cos(a), r * math.sin(a)))
        (x00, z00), (x01, z01), (x10, z10), (x11, z11) = pts
        quad = [(x00, z00), (x10, z10), (x11, z11), (x01, z01)]
        ids = [g.v((x, hh, -z)) for hh in (h - 0.0015, h + dh) for x, z in quad]
        for q in ((4, 5, 6, 7), (0, 3, 2, 1), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
            g.f(tuple(ids[i] for i in q), RUBBER, None, True)

    for start in (math.radians(25), math.radians(205)):
        a = start
        for word in range(4):
            for _ in range(rnd.randint(3, 6)):
                w = rnd.uniform(0.006, 0.013) / r1
                block(a, a + w, r0, r1, 0.0011)
                a += w + 0.0035 / r1
            a += 0.012 / r1
        # mala oznaka ispod luka (dimenzija), niži red
        a = start + 0.05
        for _ in range(8):
            w = rnd.uniform(0.004, 0.008) / r0
            block(a, a + w, r0 - 0.014, r0 - 0.006, 0.0008)
            a += w + 0.003 / r0
    ring = [(rb + 0.066, h - 0.002), (rb + 0.067, h + 0.0009), (rb + 0.069, h + 0.0009), (rb + 0.070, h - 0.002)]
    g += lathe(ring, 120, RUBBER, hard=False)
    return g


# --------------------------------------------------------------------------- felna


def _spoke(base: float, side: float, rim_w: float, n_r: int, n_s: int) -> Geo:
    """Jedan krak para (side = ±1), loft od glavčine do oboda."""
    rb = D.RIM_D / 2
    hw = rim_w / 2
    r_h, r_t = 0.088, rb - 0.014
    h_rim = hw - 0.012
    h_hub = h_rim - CONCAVE  # konkavno lice: krak se spušta ka glavčini
    secs = []
    for i in range(n_r + 1):
        s = i / n_r
        r = r_h + (r_t - r_h) * s
        off = side * (0.0035 + 0.0175 * s)  # tangencijalni pomak centra kraka (m): par se spaja kod glavčine
        a = base + off / r
        w = 0.024 + 0.012 * s
        d = 0.030 - 0.012 * s
        hf = h_hub + (h_rim - h_hub) * s ** 1.6
        ca, sa = math.cos(a), math.sin(a)
        rd = Vector((ca, 0.0, -sa))
        td = Vector((-sa, 0.0, -ca))
        c = rd * r
        sec = [(-w / 2, -d), (w / 2, -d), (w / 2, -0.004), (w / 2 - 0.0035, 0.0), (-w / 2 + 0.0035, 0.0), (-w / 2, -0.004)]
        if n_s < 6:
            sec = [(-w / 2, -d), (w / 2, -d), (w / 2 - 0.003, 0.0), (-w / 2 + 0.003, 0.0)]
        secs.append([c + td * tx + Vector((0.0, hf + ty, 0.0)) for tx, ty in sec])
    g = Geo()
    idx = [[g.v(p) for p in s] for s in secs]
    m = len(idx[0])
    for i in range(len(idx) - 1):
        for j in range(m):
            j1 = (j + 1) % m
            g.f((idx[i][j], idx[i][j1], idx[i + 1][j1], idx[i + 1][j]), WHEEL, None, False)
    for ring, rev in ((idx[0], True), (idx[-1], False)):
        ctr = g.v(sum((g.verts[k] for k in ring), Vector()) / m)
        for j in range(m):
            j1 = (j + 1) % m
            g.f((ctr, ring[j1], ring[j]) if rev else (ctr, ring[j], ring[j1]), WHEEL, None, True)
    return g


def rim_axis(rim_w: float, seg: int, lite: bool) -> Geo:
    """Obod, bure, 10 pari krakova (konkavno), glavčina, 5 vijaka i ravna kapica bez amblema."""
    g = Geo()
    rb = D.RIM_D / 2
    hw = rim_w / 2
    lip = [(rb - 0.006, hw - 0.002), (rb + 0.010, hw + 0.002), (rb + 0.016, hw - 0.004), (rb + 0.015, hw - 0.010), (rb - 0.006, hw - 0.014)]
    g += lathe(_close(lip), seg, WHEEL, hard=False)
    lip_in = [(r, -h) for r, h in reversed(lip)]
    g += lathe(_close(lip_in), seg, WHEEL, hard=False)
    barrel = [(rb - 0.006, hw - 0.012), (rb - 0.016, hw - 0.03), (rb - 0.018, -hw + 0.02), (rb - 0.006, -hw + 0.012)]
    g += lathe(barrel, seg, WHEEL, hard=False)
    # žleb na unutrašnjoj strani oboda (prelaz lice -> bure), da obod ima dubinu
    g += lathe([(rb - 0.016, hw - 0.014), (rb - 0.024, hw - 0.022), (rb - 0.024, hw - 0.040), (rb - 0.018, hw - 0.046)], seg, WHEEL, hard=False)
    n_r, n_s = (4, 4) if lite else (9, 6)
    for k in range(10):
        base = math.radians(36.0 * k)
        for side in (-1.0, 1.0):
            g += _spoke(base, side, rim_w, n_r, n_s)
    h_hub = hw - 0.012 - CONCAVE
    hub = [(0.0, h_hub + 0.004), (0.070, h_hub + 0.004), (0.092, h_hub - 0.002), (0.096, h_hub - 0.020), (0.090, 0.034), (0.0, 0.034)]
    g += lathe(hub, seg // 2, WHEEL, hard=False)
    cap = [(0.0, h_hub + 0.012), (0.030, h_hub + 0.011), (0.034, h_hub + 0.006), (0.036, h_hub + 0.003), (0.0, h_hub + 0.003)]
    g += lathe(cap, 24 if lite else 40, WHEEL, hard=False)
    for k in range(5):
        a = 2 * math.pi * k / 5 + math.radians(18)
        b = cylinder(0.0095, 0.012, 8 if lite else 12, STEEL, axis="y")
        g.extend(b.moved(0.058 * math.cos(a), h_hub + 0.006, -0.058 * math.sin(a)))
        nut = cylinder(0.006, 0.004, 8, WHEEL, axis="y")
        g.extend(nut.moved(0.058 * math.cos(a), h_hub + 0.013, -0.058 * math.sin(a)))
    return g


def place_left(g_axis: Geo, front: bool, pivot) -> Geo:
    """Osni okvir -> prostor vozila (levi točak), apsolutno."""
    g = g_axis.copy().transform(axis_to("x"))
    x, y, z = pivot
    g = g.moved(x, y, z)
    return g


def _flatten(g: Geo) -> Geo:
    for v in g.verts:
        if v.y < 0.0:
            v.y = 0.0
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    seg = 48 if lite else 96
    for front, suffix, tw, tr, rw in ((True, "prednja", D.TIRE_W_F, D.TIRE_R_F, D.RIM_W_F), (False, "zadnja", D.TIRE_W_R, D.TIRE_R_R, D.RIM_W_R)):
        cl = D.wheel_center(front, True)
        cr = D.wheel_center(front, False)
        rim = place_left(rim_axis(rw, seg, lite), front, cl)
        tire = _flatten(place_left(tire_axis(tr, tw, lite), front, cl))
        fl = ctx.add_part(f"felna_{suffix}", "l", rim, pivot=cl, cap=1 if lite else 2)
        ctx.add_part(f"felna_{suffix}", "d", None, pivot=cr, share_from=fl.name, yaw180=True)
        gl = ctx.add_part(f"guma_{suffix}", "l", tire, pivot=cl, cap=1)
        ctx.add_part(f"guma_{suffix}", "d", None, pivot=cr, share_from=gl.name, yaw180=True)
