"""Kočnice: ventilisani diskovi 400/380 mm, čeljusti (napred monoblok sa 6 klipova, pozadi
plivajuća sa EPB) i kočioni modul. Ideje iz reference (lathe prstena, luk čeljusti), nove mere.

A07: frikcione ploče diskova su bušene (prave rupe, tri reda po spirali; lite bez rupa), a čeljusti
su zaobljena tela duž luka sa tri „režnja“ klipova na spoljnoj strani (napred)."""

from __future__ import annotations

import math

from mathutils import Vector

from config import dims as D
from lib.geo import Geo, R, axis_to, box, catmull, circle2d, cylinder, extrude, lathe, radial, rounded_box, rounded_rect, tube

DISC = "mat_brake_disc"
CAST = "mat_cast"
CAL = "mat_caliper"
STEEL = "mat_steel"
ALU = "mat_alu"
PLASTIC = "mat_plastic"



def _drilled_plate(r_in: float, r_out: float, h0: float, h1: float, seg: int) -> Geo:
    """Frikciona ploča (h0..h1 po osi) sa rupama: tri reda, 24 rupe u redu, spiralni raspored."""
    holes = []
    for row, f in enumerate((0.28, 0.52, 0.76)):
        rr = r_in + (r_out - r_in) * f
        for k in range(24):
            a = 2 * math.pi * (k + row / 3) / 24
            holes.append(circle2d(0.0034, 8, rr * math.cos(a), rr * math.sin(a)))
    g = extrude(circle2d(r_out, seg), h1 - h0, DISC, holes=[circle2d(r_in, seg)] + holes, z0=h0, hard=False)
    return g.transform(R("x", -90))


def disc_axis(r_out: float, t: float, hat_depth: float, seg: int, lite: bool) -> Geo:
    """Osni okvir (+Y ka spolja), ishodište u ravni prstena."""
    g = Geo()
    r_in = r_out - 0.072
    h = t / 2
    if lite:
        for s in (1, -1):
            ring = [(r_in, s * 0.007), (r_out - 0.001, s * 0.007), (r_out, s * (h - 0.001)), (r_out - 0.001, s * h), (r_in, s * h)]
            if s < 0:
                ring = list(reversed(ring))
            g += lathe(ring + [ring[0]], seg, DISC, hard=False)
    else:
        g += _drilled_plate(r_in, r_out, 0.007, h, seg)
        g += _drilled_plate(r_in, r_out, -h, -0.007, seg)
    vane = box(0.060, 0.012, 0.006, CAST, center=(r_in + 0.036, 0.0, 0.0), hard=False)
    g += radial(vane, 18 if lite else 36, "y")
    hat = [(r_in, h), (r_in - 0.01, h + 0.004), (0.090, hat_depth - 0.004), (0.088, hat_depth), (0.0, hat_depth), (0.0, hat_depth - 0.008), (0.084, hat_depth - 0.008), (r_in - 0.012, h - 0.003)]
    g += lathe(hat + [hat[0]], seg // 2, CAST, hard=False)
    return g


def _arc_body(r_lo: float, r_hi: float, theta: float, span: float, x0: float, x1: float, mat: str, n: int, ns: int) -> Geo:
    """Zaobljeno telo duž luka (radijalna ravan točka): presek je zaobljen pravougaonik (x × r),
    krajevi luka su zaobljeni (presek se sužava). Koordinate relativne na centar točka."""
    g = Geo()
    w, hr = x1 - x0, r_hi - r_lo
    xc, rc = (x0 + x1) / 2, (r_lo + r_hi) / 2
    rings = []
    for k in range(n + 1):
        t = 2 * k / n - 1
        f = max(0.18, (1 - abs(t) ** 4) ** 0.5)
        a = math.radians(theta + span * t)
        prof = rounded_rect(w * (0.55 + 0.45 * f), hr * f, min(w, hr * f) * 0.32, ns)
        ring = []
        for px, pr in prof:
            r = rc + pr
            ring.append(g.v((xc + px, r * math.sin(a), -r * math.cos(a))))
        rings.append(ring)
    m = len(rings[0])
    for k in range(n):
        for j in range(m):
            j1 = (j + 1) % m
            g.f((rings[k][j], rings[k][j1], rings[k + 1][j1], rings[k + 1][j]), mat, None, False)
    for ring, rev in ((rings[0], True), (rings[-1], False)):
        c = g.v(sum((g.verts[i] for i in ring), Vector()) / m)
        for j in range(m):
            j1 = (j + 1) % m
            g.f((c, ring[j1], ring[j]) if rev else (c, ring[j], ring[j1]), mat, None, False)
    return g


def caliper(front: bool, center, lite: bool) -> Geo:
    """Čeljust u prostoru vozila za levi točak (prsten diska na x = center.x)."""
    g = Geo()
    r_disc = D.DISC_R_F if front else D.DISC_R_R
    t = (D.DISC_T_F if front else D.DISC_T_R) / 2
    th = D.CAL_ANGLE
    span = 24.0 if front else 18.0
    r_pad = D.PAD_R_F if front else D.PAD_R_R
    xc = center[0]
    n, ns = (10, 3) if lite else (20, 5)
    body = Geo()
    if front:
        # monoblok: spoljna i unutrašnja polovina, most preko diska, tri režnja klipova spolja
        body += _arc_body(r_pad - 0.040, r_disc + 0.024, th, span, xc + t + 0.004, xc + t + 0.032, CAL, n, ns)
        body += _arc_body(r_pad - 0.040, r_disc + 0.024, th, span, xc - t - 0.046, xc - t - 0.004, CAL, n, ns)
        body += _arc_body(r_disc + 0.004, r_disc + 0.028, th, span * 0.92, xc - t - 0.030, xc + t + 0.026, CAL, n, ns)
        seg = 12 if lite else 24
        for k, (da, rp) in enumerate(((-0.62, 0.0155), (0.0, 0.0175), (0.62, 0.0195))):
            a = math.radians(th + span * da)
            dome = lathe([(0.0, 0.005), (rp * 0.7, 0.0045), (rp, 0.002), (rp * 1.04, 0.0)], seg, CAL, axis="x", hard=False)
            body += dome.moved(xc + t + 0.031, r_pad * math.sin(a), -r_pad * math.cos(a))
            _ = k
    else:
        body += _arc_body(r_pad - 0.030, r_disc + 0.018, th, span, xc - t - 0.058, xc - t - 0.004, CAL, n, ns)
        body += _arc_body(r_pad - 0.012, r_disc + 0.018, th, span * 0.85, xc + t + 0.004, xc + t + 0.020, CAL, n, ns)
        body += _arc_body(r_disc + 0.003, r_disc + 0.020, th, span * 0.9, xc - t - 0.040, xc + t + 0.012, CAL, n, ns)
        # EPB motor na unutrašnjoj strani
        a = math.radians(th)
        body += cylinder(0.022, 0.06, 12 if lite else 20, CAL, axis="x").moved(xc - t - 0.09, r_pad * math.sin(a), -r_pad * math.cos(a))
    g += body.moved(0.0, center[1], center[2])
    return g


def disc(front: bool, lite: bool) -> Geo:
    seg = 40 if lite else 72
    r = D.DISC_R_F if front else D.DISC_R_R
    t = D.DISC_T_F if front else D.DISC_T_R
    x_disc = D.X_DISC_F if front else D.X_DISC_R
    x_hub = D.X_HUB_F if front else D.X_HUB_R
    g = disc_axis(r, t, x_hub - x_disc, seg, lite).transform(axis_to("x"))
    x, y, z = D.wheel_center(front, True)
    return g.moved(x_disc, y, z)


def module(lite: bool) -> Geo:
    """A08: elektromehanički servo na zidu (strana vozača), glavni kočioni cilindar sa posudom,
    ABS/ESP jedinica (blok ventila, motor pumpe, upravljačka elektronika) i kočioni vodovi."""
    g = Geo()
    seg = 18 if lite else 36
    bx, by = 0.420, 0.800
    # servo (dvodelno kućište sa porubom) i elektromotor sa strane
    g += lathe([(0.0, 0.0), (0.080, 0.0), (0.085, 0.010), (0.085, 0.070), (0.089, 0.076), (0.085, 0.082), (0.085, 0.140), (0.070, 0.158), (0.0, 0.160)], seg, ALU, axis="z", hard=False).moved(bx, by, 0.822)
    g += lathe([(0.0, 0.0), (0.034, 0.0), (0.036, 0.010), (0.036, 0.090), (0.030, 0.100), (0.0, 0.100)], seg, ALU, axis="-x", hard=False).moved(bx - 0.060, by - 0.050, 0.900)
    # glavni cilindar, posuda tečnosti sa čepom
    g += lathe([(0.0, 0.0), (0.030, 0.0), (0.030, 0.120), (0.024, 0.130), (0.0, 0.130)], seg, ALU, axis="z", hard=False).moved(bx, by, 0.980)
    g += rounded_box(0.090, 0.050, 0.070, 0.012, PLASTIC, center=(bx, by + 0.055, 1.040))
    g += cylinder(0.020, 0.016, 16, PLASTIC, axis="y").moved(bx + 0.020, by + 0.088, 1.030)
    # ABS/ESP jedinica: aluminijumski blok ventila, motor pumpe, kutija elektronike
    ax, ay, az = 0.575, 0.775, 0.955
    g += rounded_box(0.110, 0.090, 0.100, 0.008, ALU, center=(ax, ay, az))
    g += lathe([(0.0, 0.0), (0.032, 0.0), (0.032, 0.060), (0.026, 0.068), (0.0, 0.068)], seg, ALU, axis="-y", hard=False).moved(ax, ay - 0.045, az)
    g += rounded_box(0.110, 0.030, 0.100, 0.008, PLASTIC, center=(ax, ay + 0.060, az))
    # vodovi: glavni cilindar -> ABS, ABS -> točkovi (početak trase)
    for dz in (0.020, -0.020):
        g += tube(catmull([Vector((bx + 0.030, by - 0.010, 1.060 + dz)), Vector((0.500, by - 0.020, 1.020 + dz)), Vector((ax - 0.055, ay - 0.010, az + dz))], 5), 0.0032, 6, ALU, hard=False)
    for k, end in enumerate((Vector((0.640, 0.700, 1.200)), Vector((0.560, 0.680, 1.080)), Vector((0.520, 0.700, 0.900)), Vector((0.600, 0.700, 0.860)))):
        g += tube(catmull([Vector((ax + 0.020 * (k - 1.5), ay + 0.040, az + 0.050)), Vector((ax + 0.030 * (k - 1.5), ay + 0.010, az + 0.090)), end], 5), 0.0028, 6, ALU, hard=False)
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    for front, suffix in ((True, "prednji"), (False, "zadnji")):
        dl = disc(front, lite)
        cl = D.wheel_center(front, True)
        x_disc = D.X_DISC_F if front else D.X_DISC_R
        piv_l = (x_disc, cl[1], cl[2])
        piv_r = (-x_disc, cl[1], cl[2])
        o = ctx.add_part(f"disk_{suffix}", "l", dl, pivot=piv_l, cap=2)
        ctx.add_part(f"disk_{suffix}", "d", None, pivot=piv_r, share_from=o.name, yaw180=True)
        cal = caliper(front, (x_disc, cl[1], cl[2]), lite)
        csuf = "prednja" if front else "zadnja"
        ctx.add_part(f"celjust_{csuf}", "l", cal, cap=2)
        ctx.add_part(f"celjust_{csuf}", "d", cal.mirrored_x(), cap=2)
    ctx.add_part("kocioni_modul", "", module(lite))
