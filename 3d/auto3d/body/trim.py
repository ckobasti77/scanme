"""Ukrasi karoserije (A07): utopljene kvake, bočni usisnici sa lopaticama, spliter, difuzor, brisači.

Kvake, usisnici, spliter i difuzor se spajaju u panel kom pripadaju (vrata, prednji i zadnji branik),
pa nema novih čvorova; brisači su `deco__karoserija__brisaci`.
"""

from __future__ import annotations

import math

from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

from body import openings as O
from body.lights import Frame
from config import body as B
from lib.geo import Geo, ccw, cw, cylinder, rounded_rect, sweep

PAINT = "mat_body_paint"
BLACK = "mat_trim_black"
CARBON = "mat_carbon"


def _cdt(outline, holes=()) -> tuple[list, list]:
    loops = [ccw(outline)] + [cw(h) for h in holes]
    coords, faces_in = [], []
    for lp in loops:
        s = len(coords)
        coords.extend(lp)
        faces_in.append(list(range(s, s + len(lp))))
    out = delaunay_2d_cdt(coords, [], faces_in, 3, 1e-7)
    return out[0], out[2]


def _side_hit(tree, z: float, y: float, off: float) -> Vector:
    loc, n, _i, _d = tree.ray_cast(Vector((2.0, y, z)), Vector((-1.0, 0.0, 0.0)))
    if loc is None:
        return Vector((0.9, y, z))
    if n.x < 0:
        n = -n
    return loc + n * off


def _projected(tree, outline, holes, off: float, mat: str) -> Geo:
    """Ravna 2D figura u (z, y), projektovana na levi bok (zrak po −x), odmaknuta `off` po normali."""
    g = Geo()
    vcos, tris = _cdt(outline, holes)
    ids = [g.v(_side_hit(tree, c[0], c[1], off)) for c in vcos]
    for t in tris:
        if len(t) >= 3:
            g.f((ids[t[0]], ids[t[2]], ids[t[1]]), mat, None, False)
    return g


# --------------------------------------------------------------------------- kvake


HANDLES = {"vrata_prednja": (-0.10, 0.905), "vrata_zadnja": (-0.955, 0.905)}  # (z centra, y), A01 §1.3


def handle_left(tree, door: str, lite: bool) -> Geo:
    """Utopljena kvaka 180 × 28 mm: ploča u boji karoserije i crna fuga od 2 mm oko nje."""
    zc, yc = HANDLES[door]
    n = 3 if lite else 6
    outer = rounded_rect(0.180, 0.028, 0.012, n, cx=zc, cy=yc)
    inner = rounded_rect(0.176, 0.024, 0.010, n, cx=zc, cy=yc)
    g = _projected(tree, outer, [inner], 0.0006, BLACK)
    g += _projected(tree, inner, [], 0.0012, PAINT)
    return g


# --------------------------------------------------------------------------- usisnici


def _v_range(poly, u: float) -> tuple[float, float]:
    vs = []
    n = len(poly)
    for i in range(n):
        (a, b), (c, d) = poly[i], poly[(i + 1) % n]
        if (a - u) * (c - u) <= 0 and abs(c - a) > 1e-9:
            vs.append(b + (d - b) * (u - a) / (c - a))
    return (min(vs), max(vs)) if vs else (0.0, 0.0)


def _box(g: Geo, c: list[Vector], mat: str) -> None:
    ids = [g.v(p) for p in c]
    for q in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        g.f(tuple(ids[i] for i in q), mat, None, True)


def intakes(surf: O.Surface, lite: bool) -> Geo:
    """Bočni usisnici: tamna kada iza otvora i pet uspravnih lopatica (4 mm, 60 mm duboke), karbon."""
    g = Geo()
    poly = O.STATE["intake"]
    cu = sum(p[0] for p in poly) / len(poly)
    cv = sum(p[1] for p in poly) / len(poly)
    for side in (1.0, -1.0):
        fr = Frame(surf, O.Param("front"), side)
        a = [fr.at(cu + (u - cu) * 0.985, cv + (v - cv) * 0.985, 0.010) for u, v in poly]
        b = [fr.at(cu + (u - cu) * 0.80, cv + (v - cv) * 0.80, 0.085) for u, v in poly]
        ia = [g.v(p) for p in a]
        ib = [g.v(p) for p in b]
        n = len(poly)
        for i in range(n):
            j = (i + 1) % n
            g.f((ia[i], ia[j], ib[j], ib[i]), CARBON, None, False)
        c = g.v(sum(b, Vector()) / n)
        for i in range(n):
            g.f((c, ib[(i + 1) % n], ib[i]), CARBON, None, False)
        u0, u1 = min(p[0] for p in poly), max(p[0] for p in poly)
        for k in range(5):
            u = u0 + (u1 - u0) * (k + 1) / 6
            lo, hi = _v_range(poly, u)
            lo, hi = lo + 0.004, hi - 0.004
            t = 0.002
            pts = [fr.at(u - t, lo, 0.004), fr.at(u + t, lo, 0.004), fr.at(u + t, hi, 0.004), fr.at(u - t, hi, 0.004)]
            dd = fr.inward(u, (lo + hi) / 2) * 0.060
            _box(g, pts + [p + dd for p in pts], CARBON)
    return g


# --------------------------------------------------------------------------- spliter


def splitter(tree, lite: bool) -> Geo:
    """Karbonski spliter: sečivo debljine 8 mm, isturen 25 mm ispred donje ivice branika na sredini,
    x ±0,70; ka krajevima se isturenje smanjuje do nule (ugao branika se povija unazad)."""
    g = Geo()
    n = 24 if lite else 48
    y0, y1 = 0.110, 0.118
    front, back = [], []
    for i in range(n + 1):
        x = -0.70 + 1.40 * i / n
        loc, _nrm, _i, _d = tree.ray_cast(Vector((x, 0.135, 4.0)), Vector((0.0, 0.0, -1.0)))
        z = loc.z if loc is not None else 2.30
        # isturenje 25 mm na sredini, ka krajevima se stapa sa branikom
        front.append((x, z + 0.025 * (1.0 - (abs(x) / 0.70) ** 4) - 0.004))
        back.append((x, z - 0.11))
    rows_top = [[Vector((x, y1, z)) for x, z in front], [Vector((x, y1, z)) for x, z in back]]
    rows_bot = [[Vector((x, y0, z)) for x, z in back], [Vector((x, y0, z)) for x, z in front]]
    for rows in (rows_top, rows_bot):
        idx = [[g.v(p) for p in r] for r in rows]
        for i in range(n):
            g.f((idx[0][i], idx[0][i + 1], idx[1][i + 1], idx[1][i]), CARBON, None, False)
    for edge in (front, back):
        idx = [(g.v((x, y0, z)), g.v((x, y1, z))) for x, z in edge]
        for i in range(n):
            g.f((idx[i][0], idx[i + 1][0], idx[i + 1][1], idx[i][1]), CARBON, None, False)
    for k in (0, -1):
        (xf, zf), (xb, zb) = front[k], back[k]
        a, b, c, d = g.v((xf, y0, zf)), g.v((xb, y0, zb)), g.v((xb, y1, zb)), g.v((xf, y1, zf))
        g.f((a, b, c, d), CARBON, None, True)
    return g


# --------------------------------------------------------------------------- difuzor


def _slab(g: Geo, outline_zy: list[tuple[float, float]], x: float, t: float, mat: str) -> None:
    """Uspravno rebro: 2D obris u (z, y), debljina t po x."""
    vcos, tris = _cdt(outline_zy)
    a = [g.v((x - t / 2, c[1], c[0])) for c in vcos]
    b = [g.v((x + t / 2, c[1], c[0])) for c in vcos]
    for tri in tris:
        if len(tri) >= 3:
            g.f((a[tri[0]], a[tri[1]], a[tri[2]]), mat, None, True)
            g.f((b[tri[0]], b[tri[2]], b[tri[1]]), mat, None, True)
    n = len(outline_zy)
    ia = [g.v((x - t / 2, p[1], p[0])) for p in outline_zy]
    ib = [g.v((x + t / 2, p[1], p[0])) for p in outline_zy]
    for i in range(n):
        j = (i + 1) % n
        g.f((ia[i], ia[j], ib[j], ib[i]), mat, None, True)


def diffuser(lite: bool) -> Geo:
    """Difuzor (A09): karbonska zadnja maska ispod branika, debljine 4 mm, sa četiri otvora za izlaze
    (Ø izlaza + 8 mm) i četiri rebra na sredini. Krije zadnji lonac i cevi; donja ivica je 20 mm iza
    gornje (usna difuzora). Ranija rampa sa rebrima ispod branika je izbačena: u rendgenu je visila
    kao staklene ploče ispod siluete."""
    g = Geo()
    y0, y1, xh, off = B.VALANCE
    t = 0.004
    n = 12 if lite else 24

    def z_at(x: float, y: float, back: float = 0.0) -> float:
        return B.rear_face_z(abs(x)) + off - 0.020 * (y1 - y) / (y1 - y0) + back

    outer = [(xh, y0), (xh, y1), (-xh, y1), (-xh, y0)]
    seg = 16 if lite else 32
    holes = []
    for tx, ty in B.EXHAUST_TIPS:
        for s in (1.0, -1.0):
            rr = B.TIP_R + 0.004
            holes.append([(s * tx + rr * math.cos(2 * math.pi * k / seg), ty + rr * math.sin(2 * math.pi * k / seg)) for k in range(seg)])
    # gušća spoljna ivica, da maska prati krivinu zadnje plohe
    dense = []
    for (ax, ay), (bx, by) in zip(outer, outer[1:] + outer[:1]):
        steps = n if abs(bx - ax) > 0.1 else 2
        dense += [(ax + (bx - ax) * k / steps, ay + (by - ay) * k / steps) for k in range(steps)]
    vcos, tris = _cdt(dense, holes)
    # unutrašnje tačke mreže po x, da ravna lica ne seku krivinu
    back = [g.v((c[0], c[1], z_at(c[0], c[1]))) for c in vcos]
    front = [g.v((c[0], c[1], z_at(c[0], c[1], t))) for c in vcos]
    for tri in tris:
        if len(tri) >= 3:
            g.f((back[tri[0]], back[tri[2]], back[tri[1]]), CARBON, None, False)
            g.f((front[tri[0]], front[tri[1]], front[tri[2]]), CARBON, None, False)
    for loop in [dense] + holes:
        m = len(loop)
        ia = [g.v((x, y, z_at(x, y))) for x, y in loop]
        ib = [g.v((x, y, z_at(x, y, t))) for x, y in loop]
        for i in range(m):
            j = (i + 1) % m
            g.f((ia[i], ia[j], ib[j], ib[i]), CARBON, None, False)
    # četiri rebra na sredini maske (30 mm iza lica, do 5 mm ispod donje ivice)
    for x in (-0.24, -0.12, 0.12, 0.24):
        zb = z_at(x, y0)
        outline = [(zb + 0.010, y0 - 0.005), (zb - 0.028, y0 - 0.002), (z_at(x, y1) - 0.006, y1 - 0.012), (z_at(x, y1) + 0.004, y1 - 0.012)]
        _slab(g, outline, x, 0.006, CARBON)
    return g


# --------------------------------------------------------------------------- brisači


def _glass_hit(tree, x: float, z: float) -> tuple[Vector, Vector]:
    loc, n, _i, _d = tree.ray_cast(Vector((x, 3.0, z)), Vector((0.0, -1.0, 0.0)))
    if loc is None:
        return Vector((x, 0.99, z)), Vector((0.0, 1.0, 0.0))
    return loc, (n if n.y > 0 else -n)


def wipers(tree, lite: bool) -> Geo:
    """Dva brisača parkirana uz donju ivicu vetrobrana: ruka, metlica sa spojlerom i poklopac osovine."""
    g = Geo()
    nseg = 6 if lite else 12

    def zline(x: float) -> float:
        return 0.535 - 0.065 * (x / 0.80) ** 2  # 40 mm iznad donje ivice stakla

    for x_pivot, x_tip in ((-0.10, 0.62), (-0.70, -0.16)):
        pts, nrms = [], []
        for i in range(nseg + 1):
            x = x_pivot + (x_tip - x_pivot) * i / nseg
            loc, n = _glass_hit(tree, x, zline(x))
            pts.append(loc + n * (-0.012 + 0.010))  # staklo je uvučeno 12 mm, metlica 10 mm iznad njega
            nrms.append(n)
        up = sum(nrms, Vector()).normalized()
        blade = [p for p in pts[1:]]
        g += sweep(blade, [(-0.004, -0.004), (0.004, -0.004), (0.003, 0.003), (0.0, 0.010), (-0.003, 0.003)], BLACK, hard=False,
                   up_hint=tuple(up))
        arm = [pts[0] + up * 0.010, pts[1] + up * 0.020, pts[len(pts) // 2] + up * 0.022, pts[-2] + up * 0.018]
        g += sweep(arm, rounded_rect(0.012, 0.007, 0.003, 2), BLACK, hard=False, up_hint=tuple(up))
        cap = cylinder(0.016, 0.018, 12 if lite else 20, BLACK, axis="y")
        g += cap.moved(pts[0].x, pts[0].y + 0.004, pts[0].z)
    return g


# --------------------------------------------------------------------------- tablica


def plate_recess(surf: O.Surface, end: str, lite: bool) -> Geo:
    """Podloga udubljenja za registarsku tablicu (bez tablice i teksta), 13 mm iza lica branika.
    Karbon (sjaj) umesto mat crne: udubljenje se čita kao površina, ne kao rupa."""
    g = Geo()
    rect = O.PLATE if end == "rear" else O.PLATE_F
    u1 = rect[1] + 0.006
    v0, v1 = rect[2] - 0.006, rect[3] + 0.006
    n = 8 if lite else 16
    for side in (1.0, -1.0):
        fr = Frame(surf, O.Param(end), side)
        rows = [[fr.at(-0.55 + (u1 + 0.55) * i / n, v0 + (v1 - v0) * k / 3, 0.013) for k in range(4)] for i in range(n + 1)]
        idx = [[g.v(p) for p in r] for r in rows]
        for i in range(n):
            for k in range(3):
                g.f((idx[i][k], idx[i + 1][k], idx[i + 1][k + 1], idx[i][k + 1]), CARBON, None, False)
    return g
