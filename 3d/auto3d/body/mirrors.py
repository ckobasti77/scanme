"""Retrovizor (A07): kapica u boji karoserije, crno kućište oko stakla (podela 12 mm ispred stakla), staklo
ogledala u crnom ramu i kratka nožica (22 mm) sa malim podnožjem na vrhu vrata."""

from __future__ import annotations

from mathutils import Vector

from lib.geo import Geo, loft, rounded_rect, superellipse2d, sweep

PAINT = "mat_body_paint"
BLACK = "mat_trim_black"
CHROME = "mat_chrome"


def mirror_left(lite: bool) -> Geo:
    g = Geo()
    n = 16 if lite else 32
    cy, cz = 1.052, 0.436
    z_back = cz - 0.028  # ravna zadnja strana sa staklom
    secs = []
    table = ((0.880, 0.42), (0.893, 0.72), (0.92, 0.92), (0.97, 1.0), (1.02, 0.98), (1.046, 0.86), (1.060, 0.62), (1.065, 0.34))
    steps = 2 if lite else 3
    dense = []
    for (x0, s0), (x1, s1) in zip(table, table[1:]):
        for k in range(steps):
            t = k / steps
            dense.append((x0 + (x1 - x0) * t, s0 + (s1 - s0) * t))
    dense.append(table[-1])
    for x, s in dense:
        pts = superellipse2d(0.042 * s, 0.050 * s, 2.8, n)
        sec = []
        for pz, py in pts:
            z = cz + pz + 0.010 * (1 - s)
            sec.append((x, cy + py, max(z, z_back + 0.002 * (1 - s))))
        secs.append(sec)
    cap = loft(secs, PAINT, closed=True, caps=True, hard=False)
    # zadnji deo kućišta oko stakla je crn (podela 12 mm ispred ravni stakla), kapica spreda je u boji
    split = z_back + 0.012
    for i, f in enumerate(cap.faces):
        if sum(cap.verts[k].z for k in f) / len(f) < split:
            cap.mats[i] = BLACK
    g += cap
    # ram i staklo ogledala (staklo je 2 mm uvučeno u ram)
    rim_out = rounded_rect(0.160, 0.084, 0.028, 4 if lite else 6)
    path = [Vector((0.975 + p[0], cy + p[1], z_back - 0.002)) for p in rim_out]
    path.append(path[0])
    g += sweep(path, rounded_rect(0.006, 0.004, 0.0015, 2), BLACK, hard=False, up_hint=(0, 0, -1))
    glass = Geo()
    ids = [glass.v((0.975 + p[0] * 0.95, cy + p[1] * 0.93, z_back - 0.0005)) for p in rim_out]
    c = glass.v((0.975, cy, z_back - 0.0005))
    for i in range(len(ids)):
        glass.f((c, ids[(i + 1) % len(ids)], ids[i]), CHROME, None, False)
    g += glass
    # kratka nožica 22 mm sa vrha vrata (ugao kod A-stuba) do kućišta, i malo podnožje
    stalk = [Vector((0.856, 0.992, 0.462)), Vector((0.872, 1.006, 0.456)), Vector((0.890, 1.020, 0.450))]
    g += sweep(stalk, rounded_rect(0.034, 0.022, 0.008, 3), BLACK, hard=False)
    foot = [Vector((0.850, 0.988, 0.484)), Vector((0.856, 0.990, 0.462)), Vector((0.862, 0.993, 0.440))]
    g += sweep(foot, rounded_rect(0.024, 0.012, 0.005, 3), BLACK, hard=False, scales=[0.6, 1.0, 0.6])
    return g
