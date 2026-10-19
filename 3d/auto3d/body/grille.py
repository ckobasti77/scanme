"""Maska bez logoa (A07): sjajno crn okvir sa tankim hromiranim rubom, 3D vodoravne lamele i tamna
zadnja ploča. Sredina nema mesto za amblem.

Otvor je rupa u kavezu (A06), a maska prati njegovu ivicu i luk prednjeg lica u tlocrtu.
A09: otvor ide od donje linije branika do LED trake (lice više nije zid u boji karoserije), rešetka
je od vodoravnih lamela (velika zaobljena maska sa rombovima podseća na jednu marku), a tablica je na
nosaču preko donjeg dela maske.
"""

from __future__ import annotations

import json
import math

from lib import scene
from mathutils import Vector

from lib.geo import Geo, extrude, rounded_rect, sweep

BLACK = "mat_trim_black"
CHROME = "mat_chrome"
BEND = 0.22  # z(x) = z0 − BEND·x²: prednje lice u tlocrtu


def opening() -> tuple[float, float, float, float]:
    """(x_max, y_min, y_max, z na sredini) otvora maske iz spoljne ivice branika (gap_edges)."""
    from body import shell

    edges = shell.GAP_EDGES.get("part__karoserija__branik_prednji")
    if not edges:
        f = scene.OUT / "gap_edges.json"
        edges = json.loads(f.read_text(encoding="utf-8")).get("part__karoserija__branik_prednji", []) if f.exists() else []
    pts = [p for p in edges if p[2] > 2.2 and abs(p[0]) < 0.58 and 0.15 < p[1] < 0.60]  # A09: iznad 0,60 su ivice otvora farova
    if not pts:
        return 0.50, 0.25, 0.44, 2.36
    mid = [p for p in pts if abs(p[0]) < 0.15] or pts
    z0 = sum(p[2] for p in mid) / len(mid)
    return (max(abs(p[0]) for p in pts), min(p[1] for p in pts), max(p[1] for p in pts), z0)


def _clip(px, py, dx, dy, x0, x1, y0, y1):
    """Liang–Barsky: parametri t prave p + t·d unutar pravougaonika (ili None)."""
    t0, t1 = -1e9, 1e9
    for p, q in ((-dx, px - x0), (dx, x1 - px), (-dy, py - y0), (dy, y1 - py)):
        if abs(p) < 1e-12:
            if q < 0:
                return None
            continue
        t = q / p
        if p < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
    return (t0, t1) if t0 < t1 else None


def _bar(g: Geo, a, b, w: float, z0: float, z1: float, mat: str) -> None:
    (ax, ay), (bx, by) = a, b
    L = math.hypot(bx - ax, by - ay)
    nx, ny = -(by - ay) / L * w / 2, (bx - ax) / L * w / 2
    quad = [(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)]
    ids = [g.v((x, y, z)) for z in (z0, z1) for x, y in quad]
    for q in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        g.f(tuple(ids[i] for i in q), mat, None, True)


def grille(lite: bool) -> Geo:
    g = Geo()
    x_max, y_min, y_max, z_mid = opening()
    w, h = 2 * x_max + 0.010, (y_max - y_min) + 0.010
    yc = (y_min + y_max) / 2
    zf = z_mid - 0.022  # lice okvira, 22 mm iza ivice otvora (A09: plića maska, ispred interkulera)
    r = min(0.07, h * 0.45)
    n = 4 if lite else 8
    frame_out = rounded_rect(w, h, r, n)
    frame_in = rounded_rect(w - 0.036, h - 0.036, max(r - 0.018, 0.01), n)
    g += extrude(frame_out, 0.045, BLACK, holes=[frame_in]).moved(0, yc, zf - 0.045)
    # tanak hromirani rub na licu okvira (jedini svetli detalj maske)
    ring = [Vector((x, yc + y, zf + 0.0015)) for x, y in rounded_rect(w - 0.012, h - 0.012, max(r - 0.006, 0.01), n)]
    ring.append(ring[0])
    g += sweep(ring, rounded_rect(0.004, 0.003, 0.0012, 2), CHROME, hard=False, up_hint=(0, 0, 1))
    # 3D rešetka: vodoravne lamele (8 mm lice, 26 mm duboke, korak 42 mm; lite 56 mm), krajevi prate
    # unutrašnji zaobljeni obris okvira
    pitch = 0.056 if lite else 0.042
    wi, hi, ri = w - 0.036, h - 0.036, max(r - 0.018, 0.01)

    def half_width(y: float) -> float:
        dy = abs(y - yc) - (hi / 2 - ri)
        if dy <= 0:
            return wi / 2 + 0.002
        return wi / 2 - ri + math.sqrt(max(ri * ri - dy * dy, 0.0)) + 0.002

    nb = int((hi - 0.012) / pitch)
    y_first = yc - (nb - 1) * pitch / 2
    for k in range(nb):
        y = y_first + k * pitch
        hw = half_width(y)
        if hw < 0.05:
            continue
        # lamela: prednja ivica viša od zadnje (blag nagib nadole, lice od 8 mm)
        prof = [(zf - 0.016, y + 0.004), (zf - 0.016, y - 0.004), (zf - 0.042, y - 0.010), (zf - 0.042, y - 0.002)]
        ids = [g.v((x, yy, zz)) for x in (-hw, hw) for zz, yy in prof]
        for q in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            g.f(tuple(ids[i] for i in q), BLACK, None, True)
    # nosač tablice preko donjeg dela maske (520 × 112 mm, bez tablice i teksta)
    py = y_min + 0.082
    g += extrude(rounded_rect(0.530, 0.122, 0.012, n), 0.006, BLACK).moved(0, py, zf - 0.004)
    g += extrude(rounded_rect(0.520, 0.112, 0.010, n), 0.004, BLACK, holes=[rounded_rect(0.508, 0.100, 0.008, n)]).moved(0, py, zf + 0.002)
    # zadnja ploča (zaklanja hladnjake)
    g += extrude(rounded_rect(w - 0.01, h - 0.01, r, n), 0.004, BLACK).moved(0, yc, zf - 0.052)
    # savijanje po luku prednjeg lica
    for v in g.verts:
        v.z -= BEND * v.x * v.x
    return g
