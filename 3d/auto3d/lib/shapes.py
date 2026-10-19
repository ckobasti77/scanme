"""Reusable mechanical shapes (vehicle-local coordinates unless noted)."""

from __future__ import annotations

import math

from mathutils import Matrix, Vector

from .geo import (
    Geo,
    R,
    T,
    TAU,
    circle2d,
    extrude,
    helix_path,
    lathe,
    look_axis,
    polyline_fillet,
    rounded_rect,
    sweep,
    tube,
)


def along(g: Geo, p0, p1) -> Geo:
    """Orient geometry built along +Y (from y=0) so it spans from p0 toward p1."""
    a, b = Vector(p0), Vector(p1)
    m = T(*a) @ look_axis(b - a)
    return g.transform(m)


def bellows(r_min: float, r_max: float, length: float, folds: int, mat: str, seg: int = 20) -> Geo:
    prof = [(0.0, 0.0), (r_min, 0.0)]
    for i in range(folds * 2 + 1):
        y = length * (i + 0.5) / (folds * 2 + 1)
        prof.append((r_max if i % 2 == 0 else r_min, y))
    prof += [(r_min, length), (0.0, length)]
    return lathe(prof, seg, mat, hard=False)


def spring(r_coil: float, wire: float, height: float, turns: float, mat: str, sides: int = 10, spt: int = 24, barrel: float = 0.0) -> Geo:
    close = 0.75
    pitch = height / (turns + 2 * close * 0.15)
    path = helix_path(r_coil, pitch, turns, samples_per_turn=spt, close_ends=close)
    if barrel:
        n = len(path)
        out = []
        for i, p in enumerate(path):
            t = i / (n - 1)
            k = 1 + barrel * math.sin(math.pi * t)
            out.append(Vector((p.x * k, p.y, p.z * k)))
        path = out
    return tube(path, wire, sides, mat, hard=False, caps=True)


def box_tube(points, w: float, h: float, mat: str, r: float = 0.006, fillet: float = 0.05, n: int = 3, up=(0, 1, 0), hard: bool = False, scales=None) -> Geo:
    """Rounded-rectangle section swept along a polyline (arms, rails, links)."""
    path = polyline_fillet(points, fillet, 6) if len(points) > 2 else [Vector(p) for p in points]
    if len(path) == 2:
        a, b = path
        path = [a.lerp(b, t / 6) for t in range(7)]
    prof = rounded_rect(w, h, r, n)
    sc = None
    if scales is not None:
        s0, s1 = scales
        sc = [s0 + (s1 - s0) * i / (len(path) - 1) for i in range(len(path))]
    return sweep(path, prof, mat, up_hint=up, hard=hard, scales=sc)


def ring_x(r_in: float, r_out: float, x0: float, x1: float, mat: str, seg: int = 32, hard: bool = False) -> Geo:
    """Tube section along vehicle x from x0 to x1 (e.g. bushings, bearing bores)."""
    L = x1 - x0
    prof = [(r_in, 0.0), (r_out, 0.0), (r_out, L), (r_in, L), (r_in, 0.0)]
    g = lathe(prof, seg, mat, axis="x", hard=hard)
    return g.moved(x0, 0, 0)


def bushing(axis: str, r_out: float, length: float, rubber: str, steel: str, seg: int = 20) -> Geo:
    """Rubber bushing with a steel sleeve and a visible inner tube, centred at the origin."""
    g = Geo()
    y0 = -length / 2
    g += lathe([(0.0, y0), (r_out * 0.45, y0), (r_out * 0.45, y0 + length), (0.0, y0 + length)], seg, steel, axis=axis, hard=False)
    g += lathe([(r_out * 0.45, y0 + 0.003), (r_out * 0.88, y0 + 0.003), (r_out * 0.88, y0 + length - 0.003), (r_out * 0.45, y0 + length - 0.003)], seg, rubber, axis=axis, hard=False)
    g += lathe([(r_out * 0.86, y0 + 0.002), (r_out, y0 + 0.002), (r_out, y0 + length - 0.002), (r_out * 0.86, y0 + length - 0.002), (r_out * 0.86, y0 + 0.002)], seg, steel, axis=axis, hard=False)
    return g


def ball_joint(r: float, mat: str, boot: str, stud_dir=(0, 1, 0), seg: int = 18) -> Geo:
    g = Geo()
    house = lathe([(0.0, -r), (r * 0.9, -r), (r, -r * 0.4), (r, r * 0.3), (r * 0.7, r * 0.7), (0.0, r * 0.75)], seg, mat, hard=False)
    g += house
    bt = lathe([(r * 0.7, r * 0.6), (r * 0.95, r * 0.9), (r * 0.6, r * 1.35), (r * 0.35, r * 1.5), (0.0, r * 1.52)], seg, boot, hard=False)
    g += bt
    stud = lathe([(0.0, r * 1.4), (r * 0.35, r * 1.4), (r * 0.28, r * 2.6), (0.0, r * 2.65)], 10, mat, hard=False)
    g += stud
    d = Vector(stud_dir).normalized()
    return g.transform(look_axis(d))


def hex_nut(af: float, h: float, mat: str) -> Geo:
    outline = circle2d(af / math.sqrt(3), 6, phase=math.pi / 6)
    g = extrude(outline, h, mat, hard=True, z0=-h / 2)
    return g.transform(R("x", -90))


def resample_closed(pts2d, ds: float):
    """Resample a closed 2D polyline at spacing ds; returns (points, arc-length params)."""
    P = [Vector((p[0], p[1])) for p in pts2d]
    seglen = [(P[(i + 1) % len(P)] - P[i]).length for i in range(len(P))]
    total = sum(seglen)
    n = max(8, int(total / ds))
    out, params = [], []
    i, acc = 0, 0.0
    for k in range(n):
        s = total * k / n
        while acc + seglen[i] < s and i < len(P) - 1:
            acc += seglen[i]
            i += 1
        t = (s - acc) / seglen[i] if seglen[i] > 1e-9 else 0.0
        out.append(P[i].lerp(P[(i + 1) % len(P)], t))
        params.append(s)
    return out, params, total


def belt_mesh(path_uv, to3d, width: float, thickness: float, mat: str, tooth_h: float = 0.0, pitch: float = 0.0, ds: float = 0.006) -> Geo:
    """Closed belt along a CCW 2D path (u, v); outer side = right of travel. `to3d(u, v, w)` maps
    in-plane coordinates plus the width offset w to 3D. Optional inner teeth (timing belt)."""
    step = pitch / 4 if pitch else ds
    pts, params, total = resample_closed(path_uv, step)
    n = len(pts)
    g = Geo()
    rings = []
    for k, p in enumerate(pts):
        t = (pts[(k + 1) % n] - pts[k - 1]).normalized()
        nout = Vector((t.y, -t.x))  # right of travel = outer side
        inner = 0.0
        if tooth_h and pitch:
            ph = (params[k] % pitch) / pitch
            inner = tooth_h if 0.15 < ph < 0.60 else 0.0
        o = p + nout * thickness
        i_ = p - nout * inner
        rings.append([
            g.v(to3d(o.x, o.y, -width / 2)),
            g.v(to3d(o.x, o.y, width / 2)),
            g.v(to3d(i_.x, i_.y, width / 2)),
            g.v(to3d(i_.x, i_.y, -width / 2)),
        ])
    for k in range(n):
        A, B = rings[k], rings[(k + 1) % n]
        for j in range(4):
            j1 = (j + 1) % 4
            g.f((A[j], B[j], B[j1], A[j1]), mat, None, False)
    return g


# --------------------------------------------------------------------------- A08: mehanika


def along_z(outline_xy, z0: float, z1: float, mat: str, hard: bool = True, holes=()) -> Geo:
    """Obris (x, y) u prostoru vozila izvučen duž z od z0 do z1 (kućišta, blok, glava)."""
    return extrude(outline_xy, z1 - z0, mat, holes=holes, hard=hard, z0=z0)


def along_x(outline_zy, x0: float, x1: float, mat: str, hard: bool = True) -> Geo:
    """Obris (z, y) izvučen duž x od x0 do x1."""
    g = extrude([(z, y) for z, y in outline_zy], x1 - x0, mat, hard=hard, z0=0.0)
    # (a, b, d) -> (d + x0, b, a)
    m = Matrix(((0, 0, 1, x0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1)))
    return g.transform(m)


def bolt(p, axis: str, mat: str, af: float = 0.010, h: float = 0.006) -> Geo:
    """Šestougaona glava vijka sa osom `axis` (x, -x, y, -y, z, -z), donja strana na p."""
    from .geo import axis_to

    g = extrude(circle2d(af / math.sqrt(3), 6, phase=math.pi / 6), h, mat, hard=True, z0=0.0)
    g.transform(R("x", -90))  # visina duž +y
    g.transform(axis_to(axis))
    return g.moved(*p)


def boss(p, axis: str, r: float, h: float, mat: str, seg: int = 16) -> Geo:
    """Okrugla izbočina (čep, senzor, priključak) na licu sa normalom `axis`."""
    from .geo import axis_to

    prof = [(0.0, 0.0), (r, 0.0), (r, h * 0.75), (r * 0.82, h), (0.0, h)]
    return lathe(prof, seg, mat, axis="y", hard=False).transform(axis_to(axis)).moved(*p)


def hose(points, r: float, sides: int, mat: str, samples: int = 6, cuffs: bool = False, cuff_mat: str | None = None) -> Geo:
    """Crevo ili cev kroz kontrolne tačke (Catmull-Rom), sa obujmicama na krajevima."""
    from .geo import catmull

    path = catmull(points, samples)
    g = tube(path, r, sides, mat, hard=False)
    if cuffs:
        cm = cuff_mat or mat
        for a, b in ((path[0], path[1]), (path[-1], path[-2])):
            d = (b - a).normalized()
            c = a + d * 0.018
            ring = lathe([(r * 1.02, -0.006), (r * 1.16, -0.005), (r * 1.16, 0.005), (r * 1.02, 0.006)], max(8, sides), cm, hard=False)
            g += ring.transform(T(*c) @ look_axis(d))
    return g


def volute_z(cx: float, cy: float, z: float, R0: float, R1: float, r0: float, r1: float, mat: str, sides: int, steps: int,
             start_deg: float, turn: float = 320.0, outlet_len: float = 0.05, sign: float = 1.0) -> Geo:
    """Pužno kućište (turbina, kompresor) oko ose z u ravni z: presek raste r0 -> r1 i završava se
    tangentnim izlazom. sign = smer obilaska (+1 suprotno kazaljci gledano sa +z)."""
    path, scales = [], []
    for i in range(steps + 1):
        t = i / steps
        a = math.radians(start_deg + sign * turn * t)
        rr = R0 + (R1 - R0) * t
        path.append(Vector((cx + rr * math.cos(a), cy + rr * math.sin(a), z)))
        scales.append((r0 + (r1 - r0) * t) / r1)
    a_end = math.radians(start_deg + sign * turn)
    tang = Vector((-math.sin(a_end), math.cos(a_end), 0.0)) * sign
    last = path[-1]
    for k in range(1, 4):
        path.append(last + tang * (outlet_len * k / 3))
        scales.append(1.0)
    prof = [(r1 * math.cos(2 * math.pi * j / sides), r1 * math.sin(2 * math.pi * j / sides)) for j in range(sides)]
    return sweep(path, prof, mat, hard=False, scales=scales, up_hint=(0, 0, 1))
