"""Prenos snage (A08): 8-brzinski automatik (zvono sa pretvaračem, rebrasto kućište, korito sa
rebrima, konektor), prenosna kutija sa lančanim kućištem i aktuatorom spojnice, prednje i zadnje
kardansko vratilo (elastični disk, homokinetički zglobovi, srednji ležaj), diferencijali (prednji
otvoren, levo od kartera; zadnji sa rebrastim poklopcem i aktuatorom blokade) i poluosovine sa
zglobovima i manžetnama. Desna prednja poluosovina prolazi kroz tunel u karteru.
"""

from __future__ import annotations

import math

from mathutils import Vector

from config import dims as D
from lib.geo import Geo, R, T, axis_to, box, cylinder, lathe, loft, radial, rounded_box, superellipse2d, tube
from lib.shapes import along, bellows, bolt, box_tube

ALU = "mat_alu"
STEEL = "mat_steel"
CAST = "mat_cast"
RUBBER = "mat_rubber"

V = Vector
GB_Y = 0.400  # osa menjača = osa radilice
GB_Z0, GB_Z1 = 0.300, 0.978  # zadnji kraj .. prirubnica zvona (2 mm od prirubnice bloka)
TC_FRONT = (0.200, 0.215, 0.268)  # prednji izlaz prenosne kutije
REAR_OUT = (0.0, 0.330, 0.040)  # zadnji izlaz prenosne kutije
FD = V((D.FRONT_DIFF_X, D.FRONT_DIFF_Y, D.Z_AXLE_F))
FD_PINION = V((D.FRONT_DIFF_X, D.FRONT_DIFF_Y, D.Z_AXLE_F - 0.125))
RD = V((0.0, 0.340, D.Z_AXLE_R))


def gearbox(lite: bool) -> Geo:
    n = 20 if lite else 40
    g = Geo()
    # zvono pretvarača, prelaz, telo sa planetarnim slogovima, zadnji produžetak
    st = [(GB_Z1, 0.214, 0.212), (GB_Z1 - 0.012, 0.218, 0.216), (GB_Z1 - 0.030, 0.214, 0.212), (0.880, 0.200, 0.198), (0.800, 0.168, 0.172), (0.740, 0.150, 0.160),
          (0.560, 0.142, 0.152), (0.440, 0.136, 0.146), (0.380, 0.120, 0.124), (GB_Z0 + 0.020, 0.088, 0.090), (GB_Z0, 0.082, 0.084)]
    secs = [[(px, GB_Y + py, z) for px, py in superellipse2d(rx, ry, 2.3, n)] for z, rx, ry in st]
    g += loft(secs, ALU, closed=True, caps=True, hard=False)
    # uzdužna i poprečna rebra na zvonu i telu
    for a in (35, 70, 110, 145):
        r = math.radians(a)
        for s in (-1, 1):
            p0 = V((s * 0.205 * math.cos(r), GB_Y + 0.205 * math.sin(r), GB_Z1 - 0.040))
            p1 = V((s * 0.150 * math.cos(r), GB_Y + 0.158 * math.sin(r), 0.760))
            g += box_tube([p0, p1], 0.010, 0.016, ALU, r=0.003)
    for z in (0.700, 0.620, 0.540, 0.460) if not lite else (0.660, 0.500):
        ring = [(px * 1.06, GB_Y + py * 1.06, z) for px, py in superellipse2d(0.140, 0.140, 2.3, n)]
        g += tube([V(p) for p in ring], 0.008, 6, ALU, closed_path=True, caps=False)
    # spoj zvona i kućišta (prirubnica sa zavrtnjima) i uzdužna rebra donjeg dela kućišta
    flange = [(px * 1.10, GB_Y + py * 1.10, 0.880) for px, py in superellipse2d(0.200, 0.198, 2.3, n)]
    g += tube([V(p) for p in flange], 0.010, 6, ALU, closed_path=True, caps=False)
    for a in (200, 235, 270, 305, 340):
        r = math.radians(a)
        p0 = V((0.150 * math.cos(r), GB_Y + 0.158 * math.sin(r), 0.840))
        p1 = V((0.134 * math.cos(r), GB_Y + 0.144 * math.sin(r), 0.420))
        g += box_tube([p0, p1], 0.012, 0.014, ALU, r=0.003)
    # korito ulja sa rebrima i čepom, ploča razvodnika
    g += rounded_box(0.240, 0.050, 0.420, 0.016, ALU, center=(0.0, GB_Y - 0.168, 0.560))
    if not lite:
        for k in range(7):
            g += box(0.230, 0.006, 0.006, ALU, center=(0.0, GB_Y - 0.195, 0.380 + 0.060 * k))
    g += bolt((0.050, GB_Y - 0.194, 0.700), "-y", STEEL, af=0.017, h=0.008)
    # električni konektor upravljačke jedinice, vodovi hladnjaka ulja
    g += rounded_box(0.040, 0.030, 0.050, 0.008, STEEL, center=(0.150, GB_Y - 0.040, 0.640))
    for dy in (0.0, 0.030):
        g += tube([V((-0.142, GB_Y - 0.060 + dy, 0.620)), V((-0.180, GB_Y - 0.060 + dy, 0.700)), V((-0.185, GB_Y - 0.050 + dy, 0.900))], 0.006, 8, STEEL)
    # nosač menjača: guma na poprečnom nosaču koji se kači za ivice tunela
    g += rounded_box(0.090, 0.040, 0.070, 0.010, STEEL, center=(0.0, GB_Y - 0.110, 0.420))
    g += rounded_box(0.060, GB_Y - 0.130 - 0.172, 0.050, 0.008, STEEL, center=(0.0, (GB_Y - 0.130 + 0.172) / 2, 0.420))
    g += box_tube([V((-0.268, 0.226, 0.420)), V((-0.230, 0.166, 0.420)), V((0.230, 0.166, 0.420)), V((0.268, 0.226, 0.420))], 0.020, 0.044, STEEL, r=0.005, fillet=0.02)
    return g


def transfer(lite: bool) -> Geo:
    g = Geo()
    seg = 20 if lite else 36
    # glavni deo oko izlazne osovine menjača i donji levi deo prednjeg izlaza, spojeni lančanim kućištem
    g += lathe([(0.0, 0.0), (0.100, 0.0), (0.110, 0.020), (0.110, 0.180), (0.090, 0.200), (0.0, 0.200)], seg, ALU, axis="-z", hard=False).moved(0.0, GB_Y - 0.040, GB_Z0)
    g += lathe([(0.0, 0.0), (0.070, 0.0), (0.078, 0.018), (0.078, 0.150), (0.060, 0.170), (0.0, 0.170)], seg, ALU, axis="-z", hard=False).moved(TC_FRONT[0], TC_FRONT[1], GB_Z0 - 0.010)
    a, b = V((0.0, GB_Y - 0.040)), V((TC_FRONT[0], TC_FRONT[1]))
    d = (b - a).normalized()
    nrm = V((-d.y, d.x))
    pts = [a + nrm * 0.090, b + nrm * 0.060, b - nrm * 0.060, a - nrm * 0.090]
    from lib.geo import extrude

    g += extrude([(p.x, p.y) for p in pts], 0.150, ALU, z0=GB_Z0 - 0.170)
    # izlazne prirubnice, aktuator višelamelne spojnice (elektromotor)
    g += lathe([(0.0, 0.0), (0.042, 0.0), (0.042, 0.016), (0.0, 0.016)], seg, STEEL, axis="z", hard=False).moved(TC_FRONT[0], TC_FRONT[1], GB_Z0 - 0.020)
    g += lathe([(0.0, 0.0), (0.050, 0.0), (0.050, 0.016), (0.0, 0.016)], seg, STEEL, axis="-z", hard=False).moved(REAR_OUT[0], REAR_OUT[1], GB_Z0 - 0.200)
    g += lathe([(0.0, 0.0), (0.035, 0.0), (0.035, 0.070), (0.027, 0.080), (0.0, 0.080)], seg, ALU, axis="-x", hard=False).moved(-0.080, GB_Y + 0.010, GB_Z0 - 0.100)
    if not lite:
        for k in range(8):
            ang = 2 * math.pi * k / 8
            g += bolt((0.100 * math.cos(ang), GB_Y - 0.040 + 0.100 * math.sin(ang), GB_Z0 - 0.200), "-z", STEEL, af=0.009, h=0.005)
    return g


def flex_disc(p, axis: str, r: float, lite: bool) -> Geo:
    """Elastični disk (gumeni „guibo“) sa šest čaura."""
    g = lathe([(r * 0.35, -0.014), (r, -0.014), (r, 0.014), (r * 0.35, 0.014), (r * 0.35, -0.014)], 12 if lite else 24, RUBBER, axis=axis, hard=False)
    return g.moved(*p)


def cv_joint(p, axis: str, r: float, lite: bool) -> Geo:
    seg = 12 if lite else 24
    g = lathe([(0.0, -0.030), (r * 1.10, -0.026), (r * 1.25, -0.010), (r * 1.25, 0.010), (r * 1.10, 0.026), (0.0, 0.030)], seg, STEEL, axis=axis, hard=False)
    return g.moved(*p)


def shaft_seg(a: V, b: V, r: float, lite: bool) -> Geo:
    return tube([a, b], r, 12 if lite else 20, STEEL, hard=False)


def front_prop(lite: bool) -> Geo:
    g = Geo()
    a = V(TC_FRONT) + V((0.0, 0.0, 0.030))
    b = FD_PINION - V((0.0, 0.0, 0.050))
    mid = a.lerp(b, 0.48)
    g += flex_disc(a + V((0, 0, 0.010)), "z", 0.050, lite)
    g += shaft_seg(a + V((0, 0, 0.024)), mid, 0.026, lite)
    g += cv_joint(mid, "z", 0.030, lite)
    g += shaft_seg(mid, b, 0.024, lite)
    g += cv_joint(b, "z", 0.028, lite)
    return g


def rear_prop(lite: bool) -> Geo:
    g = Geo()
    a = V(REAR_OUT) + V((0.0, 0.0, -0.180))
    c = V((0.0, 0.330, -0.580))
    b = V((0.0, RD.y, RD.z + 0.215))
    g += flex_disc(a, "z", 0.060, lite)
    g += shaft_seg(a + V((0, 0, -0.016)), c + V((0, 0, 0.040)), 0.040, lite)
    # srednji ležaj u gumi sa nosačem ka tunelu
    seg = 16 if lite else 28
    g += lathe([(0.030, -0.025), (0.055, -0.025), (0.055, 0.025), (0.030, 0.025)], seg, RUBBER, axis="z", hard=False).moved(*c)
    g += box_tube([V((-0.100, 0.405, c.z)), V((-0.050, 0.390, c.z)), V((0.050, 0.390, c.z)), V((0.100, 0.405, c.z))], 0.030, 0.010, STEEL, r=0.003, fillet=0.02)
    g += cv_joint(c + V((0, 0, -0.045)), "z", 0.040, lite)
    g += shaft_seg(c + V((0, 0, -0.075)), b, 0.034, lite)
    g += lathe([(0.0, 0.0), (0.056, 0.0), (0.056, 0.014), (0.0, 0.014)], seg, STEEL, axis="-z", hard=False).moved(b.x, b.y, b.z + 0.010)
    return g


def front_diff(lite: bool) -> Geo:
    seg = 20 if lite else 36
    g = Geo()
    c = FD
    # kućište krunskog zupčanika (osa po x) i nos pogonskog zupčanika ka nazad
    g += lathe([(0.0, -0.075), (0.060, -0.070), (0.084, -0.040), (0.088, 0.000), (0.084, 0.040), (0.062, 0.068), (0.0, 0.072)], seg, CAST, axis="x", hard=False).moved(c.x, c.y, c.z)
    g += lathe([(0.0, 0.0), (0.060, 0.0), (0.050, 0.060), (0.040, 0.090), (0.034, 0.100), (0.0, 0.100)], seg, CAST, axis="-z", hard=False).moved(c.x, c.y, c.z - 0.030)
    # rebra, izlazi (levo prirubnica, desno ka tunelu u karteru), uši za nosač
    if not lite:
        for a in range(0, 360, 45):
            fin = box(0.006, 0.020, 0.090, CAST, center=(0.0, 0.080, 0.0)).transform(R("x", a))
            g += fin.moved(c.x, c.y, c.z)
    g += lathe([(0.0, 0.0), (0.046, 0.0), (0.046, 0.014), (0.0, 0.014)], seg, STEEL, axis="x", hard=False).moved(c.x + 0.076, c.y, c.z)
    g += lathe([(0.0, 0.0), (0.040, 0.0), (0.040, 0.020), (0.0, 0.020)], seg, STEEL, axis="-x", hard=False).moved(c.x - 0.076, c.y, c.z)
    for dz in (-0.060, 0.070):
        g += box(0.030, 0.050, 0.030, CAST, center=(c.x + 0.020, c.y + 0.090, c.z + dz))
    return g


def rear_diff(lite: bool) -> Geo:
    seg = 24 if lite else 44
    g = Geo()
    c = RD
    g += lathe([(0.0, -0.110), (0.080, -0.100), (0.116, -0.060), (0.124, 0.000), (0.118, 0.050), (0.090, 0.090), (0.0, 0.100)], seg, CAST, axis="x", hard=False).moved(c.x, c.y, c.z)
    g += lathe([(0.0, 0.0), (0.080, 0.0), (0.070, 0.090), (0.056, 0.170), (0.050, 0.190), (0.0, 0.190)], seg, CAST, axis="z", hard=False).moved(c.x, c.y - 0.010, c.z + 0.020)
    # zadnji poklopac sa rebrima za hlađenje ulja
    g += lathe([(0.0, 0.0), (0.110, 0.0), (0.108, 0.030), (0.080, 0.050), (0.0, 0.056)], seg, CAST, axis="-z", hard=False).moved(c.x, c.y, c.z - 0.070)
    for k in range(-3, 4):
        g += box(0.006, 0.150, 0.030, CAST, center=(c.x + 0.026 * k, c.y, c.z - 0.120))
    # izlazne prirubnice, elektronska blokada (aktuator sa motorom), uši nosača
    for s in (-1, 1):
        g += lathe([(0.0, 0.0), (0.050, 0.0), (0.050, 0.020), (0.0, 0.020)], seg, STEEL, axis="x" if s > 0 else "-x", hard=False).moved(c.x + s * 0.120, c.y, c.z)
    g += lathe([(0.0, 0.0), (0.042, 0.0), (0.042, 0.090), (0.034, 0.100), (0.0, 0.100)], seg, CAST, axis="y", hard=False).moved(c.x - 0.070, c.y + 0.040, c.z - 0.050)
    for s in (-1, 1):
        g += box(0.050, 0.040, 0.040, CAST, center=(c.x + s * 0.100, c.y + 0.080, c.z + 0.090))
        g += box(0.050, 0.040, 0.040, CAST, center=(c.x + s * 0.110, c.y + 0.070, c.z - 0.100))
    return g


def half_shaft(p_in: V, p_out: V, lite: bool) -> Geo:
    """Poluosovina od izlaza diferencijala (unutrašnji tripod zglob) do glavčine (spoljni CV)."""
    g = Geo()
    d = (p_out - p_in)
    L = d.length
    u = d.normalized()
    seg = 14 if lite else 24
    j_in = p_in + u * 0.045
    j_out = p_out - u * 0.060
    g += along(lathe([(0.0, 0.0), (0.044, 0.0), (0.048, 0.020), (0.048, 0.060), (0.030, 0.080), (0.0, 0.082)], seg, STEEL, hard=False), p_in, p_out)
    g += along(bellows(0.018, 0.040, 0.085, 3, RUBBER, seg=seg), j_in + u * 0.035, p_out)
    g += tube([j_in + u * 0.110, j_out - u * 0.110], 0.015, 10 if lite else 16, STEEL, hard=False)
    g += along(bellows(0.018, 0.040, 0.085, 3, RUBBER, seg=seg), j_out - u * 0.120, p_out)
    g += along(lathe([(0.0, 0.0), (0.046, 0.0), (0.050, 0.020), (0.046, 0.050), (0.026, 0.060), (0.0, 0.060)], seg, STEEL, hard=False), j_out - u * 0.020, p_out)
    _ = L
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    ctx.add_part("menjac", "", gearbox(lite))
    ctx.add_part("prenosna_kutija", "", transfer(lite))
    ctx.add_part("kardan_prednji", "", front_prop(lite))
    ctx.add_part("kardan_zadnji", "", rear_prop(lite))
    ctx.add_part("diferencijal_prednji", "", front_diff(lite))
    ctx.add_part("diferencijal_zadnji", "", rear_diff(lite))
    hub_f, hub_r = D.X_HUB_F - 0.075, D.X_HUB_R - 0.085
    ctx.add_part("poluosovina_prednja", "l", half_shaft(V((FD.x + 0.092, FD.y, FD.z)), V((hub_f, D.Y_WHEEL_F, D.Z_AXLE_F)), lite))
    right = half_shaft(V((-0.150, FD.y, FD.z)), V((-hub_f, D.Y_WHEEL_F, D.Z_AXLE_F)), lite)
    right += tube([V((FD.x - 0.096, FD.y, FD.z)), V((-0.150, FD.y, FD.z))], 0.020, 10 if lite else 16, STEEL, hard=False)
    right += lathe([(0.020, -0.018), (0.042, -0.018), (0.042, 0.018), (0.020, 0.018)], 16, RUBBER, axis="x", hard=False).moved(-0.150, FD.y, FD.z)
    ctx.add_part("poluosovina_prednja", "d", right)
    hl = half_shaft(V((RD.x + 0.140, RD.y, RD.z)), V((hub_r, D.Y_WHEEL_R, D.Z_AXLE_R)), lite)
    ctx.add_part("poluosovina_zadnja", "l", hl)
    ctx.add_part("poluosovina_zadnja", "d", hl.mirrored_x())
    _ = (axis_to, cylinder, radial)
