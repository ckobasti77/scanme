"""Vešanje i upravljanje (A08).

Napred: kovana dvostruka ramena (donje A-rame, gornje rame „viljuška“ iza kojeg ide amortizer),
liveni rukavac sa ležajem glavčine, krakom upravljanja i nosačem čeljusti. Pozadi: pet poluga
(dve gornje, dve donje, poluga konvergencije) na livenom nosaču točka. Vazdušne opruge sa
gumenim mehom oko adaptivnih amortizera, stabilizatori sa spojnim šipkama, podokviri (šine,
poprečni nosači, gumeni oslonci ka karoseriji, postolja nosača motora) i letva volana sa EPS
motorom paralelnim letvi. Sve za levu stranu; desna je ogledalo.
"""

from __future__ import annotations

import math

from mathutils import Vector

from config import dims as D
from lib.geo import Geo, R, T, axis_to, box, cylinder, lathe, look_axis, rounded_box, tube, catmull
from lib.shapes import along, ball_joint, bellows, bolt, box_tube, bushing

ALU = "mat_alu"
STEEL = "mat_steel"
BLACK = "mat_paint_black"
RUBBER = "mat_rubber"

V = Vector
ZF, ZR = D.Z_AXLE_F, D.Z_AXLE_R

# prednje tvrde tačke (leva strana)
F_LO_F, F_LO_R, F_LO_BJ = V((0.400, 0.215, 1.660)), V((0.400, 0.215, 1.310)), V((0.735, 0.190, 1.495))
F_UP_F, F_UP_R, F_UP_BJ = V((0.480, 0.620, 1.610)), V((0.480, 0.620, 1.370)), V((0.640, 0.632, 1.485))
F_TIE = V((0.705, 0.292, 1.630))  # zglob spone na kraku rukavca
F_DAMP_LO, F_DAMP_TOP = V((0.605, 0.232, 1.373)), V((0.585, 0.845, 1.373))  # 3 mm iza zadnjeg kraka donjeg ramena
# zadnje tvrde tačke (leva strana): (unutra, spolja)
R_LINKS = [
    (V((0.460, 0.470, -1.360)), V((0.690, 0.560, -1.440)), ALU),  # gornja prednja
    (V((0.460, 0.470, -1.600)), V((0.690, 0.560, -1.540)), ALU),  # gornja zadnja
    (V((0.420, 0.225, -1.310)), V((0.720, 0.205, -1.450)), BLACK),  # donja prednja
    (V((0.420, 0.225, -1.640)), V((0.720, 0.205, -1.530)), BLACK),  # donja zadnja
    (V((0.440, 0.305, -1.255)), V((0.720, 0.300, -1.360)), BLACK),  # poluga konvergencije
]
R_DAMP_LO, R_DAMP_TOP = V((0.655, 0.275, -1.665)), V((0.580, 0.730, -1.700))
RACK_Y, RACK_Z = 0.250, 1.640


def forged_arm(a: V, b: V, w: float, h: float, lite: bool, bow: float = 0.0, up=(0, 1, 0)) -> Geo:
    """Kovani krak sa blagim lukom i suženjem ka sredini (I-presek se čita kroz ivice)."""
    mid = a.lerp(b, 0.5) + V(up) * bow
    pts = [a, a.lerp(mid, 0.5), mid, mid.lerp(b, 0.5), b]
    path = catmull(pts, 3 if lite else 5)
    from lib.geo import rounded_rect, sweep

    n = len(path)
    sc = [1.0 - 0.18 * math.sin(math.pi * i / (n - 1)) for i in range(n)]
    return sweep(path, rounded_rect(h, w, min(w, h) * 0.3, 2 if lite else 3), ALU, up_hint=up, hard=False, scales=sc)


def eye(p: V, axis: str, r: float, length: float, lite: bool) -> Geo:
    """Oko kraka sa gumenom čaurom (osa `axis`)."""
    seg = 12 if lite else 20
    g = lathe([(r * 0.86, -length / 2), (r, -length / 2), (r, length / 2), (r * 0.86, length / 2)], seg, ALU, axis=axis, hard=False).moved(*p)
    g += lathe([(r * 0.40, -length / 2 - 0.004), (r * 0.86, -length / 2), (r * 0.86, length / 2), (r * 0.40, length / 2 + 0.004)], seg, RUBBER, axis=axis, hard=False).moved(*p)
    return g


def ball(p: V, r: float, stud_dir, lite: bool) -> Geo:
    return ball_joint(r, ALU, RUBBER, stud_dir=stud_dir, seg=10 if lite else 16).moved(*p)


# --------------------------------------------------------------------------- napred


def front_arms_left(lite: bool) -> Geo:
    g = Geo()
    # donje A-rame
    g += forged_arm(F_LO_F, F_LO_BJ, 0.054, 0.030, lite, bow=-0.006)
    g += forged_arm(F_LO_R, F_LO_BJ, 0.058, 0.032, lite, bow=-0.004)
    g += eye(F_LO_F, "z", 0.030, 0.052, lite)
    g += eye(F_LO_R, "x", 0.036, 0.050, lite)  # zadnja hidro-čaura je okrenuta poprečno
    g += ball(F_LO_BJ + V((0, 0.008, 0)), 0.022, (0, 1, 0), lite)
    # gornje rame (viljuška)
    g += forged_arm(F_UP_F, F_UP_BJ, 0.038, 0.024, lite, bow=0.012)
    g += forged_arm(F_UP_R, F_UP_BJ, 0.038, 0.024, lite, bow=0.012)
    g += eye(F_UP_F, "z", 0.024, 0.044, lite)
    g += eye(F_UP_R, "z", 0.024, 0.044, lite)
    g += ball(F_UP_BJ - V((0, 0.010, 0)), 0.018, (0, -1, 0), lite)
    # rukavac: telo od donjeg do gornjeg zgloba, ležište glavčine, krak spone, nosač čeljusti
    hub = V((0.760, D.Y_WHEEL_F, ZF))
    g += box_tube([F_LO_BJ + V((0.0, 0.020, 0.0)), V((0.738, 0.270, 1.492)), hub + V((-0.030, 0.000, 0.0)), V((0.712, 0.470, 1.488)), V((0.668, 0.580, 1.486)), F_UP_BJ - V((0, 0.024, 0))],
                  0.050, 0.060, ALU, r=0.016, fillet=0.06, up=(1, 0, 0))
    seg = 16 if lite else 32
    g += lathe([(0.0, -0.034), (0.068, -0.034), (0.072, -0.020), (0.072, 0.024), (0.064, 0.034), (0.0, 0.034)], seg, ALU, axis="x", hard=False).moved(*hub)
    g += box_tube([hub + V((-0.020, -0.040, 0.030)), V((0.718, 0.300, 1.580)), F_TIE], 0.034, 0.028, ALU, r=0.010, fillet=0.03, up=(0, 1, 0))
    g += ball(F_TIE + V((0, 0.010, 0)), 0.016, (0, 1, 0), lite)
    for dy in (0.115, -0.010):
        g += box_tube([hub + V((-0.020, dy * 0.6, -0.030)), V((0.748, D.Y_WHEEL_F + 0.040 + dy * 0.3, 1.300))], 0.030, 0.024, ALU, r=0.008, up=(1, 0, 0))
    # glavčina sa prirubnicom i navojima (naleganje diska je na X_HUB_F)
    xh = D.X_HUB_F
    g += lathe([(0.0, 0.0), (0.040, 0.0), (0.040, 0.060), (0.072, 0.064), (0.072, 0.074), (0.030, 0.076), (0.0, 0.076)], seg, ALU, axis="x", hard=False).moved(xh - 0.076, D.Y_WHEEL_F, ZF)
    return g


def air_strut(lo: V, top: V, r_bag: float, bag_y: tuple[float, float], lite: bool) -> Geo:
    """Amortizer sa vazdušnom oprugom: telo, klip, meh (valjani režanj), gornji oslonac, priključak vazduha."""
    seg = 16 if lite else 30
    g = Geo()
    L = (top - lo).length
    u = (top - lo).normalized()

    def at(y):  # tačka na osi na visini y
        return lo + u * ((y - lo.y) / u.y)

    y0, y1 = bag_y
    b0, b1 = (y0 - lo.y) / u.y, (y1 - lo.y) / u.y
    body = Geo()
    body += lathe([(0.0, 0.0), (0.018, 0.0), (0.018, 0.034), (0.0, 0.034)], seg, STEEL, axis="x", hard=False).transform(T(0, 0.017, 0))  # oko donjeg nosača
    body += lathe([(0.0, 0.030), (0.027, 0.034), (0.027, b0 - 0.030), (0.034, b0 - 0.010), (0.034, b0), (0.0, b0)], seg, STEEL, hard=False)
    body += lathe([(0.0, b0), (0.012, b0), (0.012, b1 + 0.020), (0.0, b1 + 0.020)], 12, STEEL, hard=False)
    # meh: klip na dnu, valjani režanj, gornja kapa
    k = b1 - b0
    bag = [(r_bag * 0.62, b0), (r_bag * 0.88, b0 + 0.012), (r_bag * 0.96, b0 + 0.05 * k), (r_bag, b0 + 0.35 * k), (r_bag * 0.98, b0 + 0.80 * k), (r_bag * 0.90, b1 - 0.010), (r_bag * 0.55, b1)]
    body += lathe([(0.0, b0)] + bag + [(0.0, b1)], seg, RUBBER, hard=False)
    body += lathe([(0.0, b1), (r_bag * 0.92, b1), (r_bag * 0.94, b1 + 0.012), (r_bag * 0.60, b1 + 0.024), (0.0, b1 + 0.026)], seg, STEEL, hard=False)
    # gornji oslonac (guma u čeliku) do tačke na karoseriji, priključak vazduha
    body += lathe([(0.0, b1 + 0.026), (0.050, b1 + 0.026), (0.056, L - 0.030), (0.040, L - 0.010), (0.0, L - 0.008)], seg, STEEL, hard=False)
    body += cylinder(0.006, 0.040, 8, STEEL, axis="x", center=False).moved(0.0, b1 + 0.010, 0.0)
    g += along(body, lo, top)
    _ = (at, y1)
    return g


def stabilizer(z: float, y: float, r: float, s: int, ends: list[V], lite: bool, bx: float = 0.36) -> Geo:
    """U-šipka sa krajevima ka ramenima; s = smer krajeva po z; ends = tačke spojnih šipki (levo)."""
    e = ends[0]
    pts = [V((-e.x, e.y + 0.10, e.z + s * 0.0)), V((-0.50, y + 0.012, z + s * 0.045)), V((-0.40, y, z)), V((0.40, y, z)), V((0.50, y + 0.012, z + s * 0.045)), V((e.x, e.y + 0.10, e.z))]
    g = tube(catmull(pts, 6 if lite else 10), r, 10 if lite else 16, BLACK, hard=False)
    for x in (-bx, bx):
        g += bushing("x", 0.024, 0.036, RUBBER, BLACK, seg=12 if lite else 18).moved(x, y, z)
        g += box(0.040, 0.010, 0.056, BLACK, center=(x, y + 0.024, z))
    # spojne šipke (kuglasti krajevi) do ramena
    for sx in (-1, 1):
        top = V((sx * e.x, e.y + 0.10, e.z))
        bot = V((sx * e.x, e.y, e.z))
        g += tube([top, bot], 0.007, 8, BLACK, hard=False)
        for p in (top, bot):
            g += lathe([(0.0, -0.012), (0.012, -0.008), (0.012, 0.008), (0.0, 0.012)], 10, RUBBER, hard=False).moved(*p)
    return g


def subframe_front(lite: bool) -> Geo:
    g = Geo()
    y = 0.160
    for s in (-1, 1):
        x = s * 0.420
        g += box_tube([V((x * 0.98, y + 0.040, 1.835)), V((x, y + 0.010, 1.740)), V((x, y, 1.480)), V((x, y + 0.006, 1.220)), V((x * 0.96, y + 0.030, 1.150))], 0.060, 0.050, BLACK, r=0.010, fillet=0.06)
        # gumeni oslonci ka karoseriji (napred i pozadi)
        for z in (1.820, 1.160):
            g += lathe([(0.0, 0.0), (0.040, 0.0), (0.040, 0.030), (0.034, 0.040), (0.0, 0.040)], 12 if lite else 24, RUBBER, axis="y", hard=False).moved(x * 0.98, y + 0.060, z)
        # viljuške za čaure donjeg ramena
        for z in (F_LO_F.z, F_LO_R.z):
            for dz in (-0.034, 0.034):
                g += box(0.040, 0.050, 0.008, BLACK, center=(s * 0.400, 0.205, z + dz))
        # postolje nosača motora na zadnjem poprečnom nosaču
        g += rounded_box(0.060, 0.115, 0.060, 0.010, BLACK, center=(s * 0.310, 0.2325, 1.205))
        g += lathe([(0.0, 0.0), (0.034, 0.0), (0.038, 0.020), (0.034, 0.036), (0.0, 0.036)], 12 if lite else 24, RUBBER, axis="y", hard=False).moved(s * 0.310, 0.290, 1.205)
    for z in (1.740, 1.220):
        g += box_tube([V((-0.420, y + 0.004, z)), V((0.0, y - 0.004, z)), V((0.420, y + 0.004, z))], 0.050, 0.060, BLACK, r=0.010, fillet=0.20)
    # nosači letve volana
    for x in (-0.285, 0.240):
        g += box(0.050, RACK_Y - 0.030 - (y + 0.020), 0.040, BLACK, center=(x, (RACK_Y - 0.030 + y + 0.020) / 2, 1.700))
    return g


def rack(lite: bool) -> Geo:
    g = Geo()
    seg = 16 if lite else 28
    y, z = RACK_Y, RACK_Z
    g += cylinder(0.030, 0.600, seg, ALU, axis="x").moved(0.0, y, z)
    # EPS: motor paralelan letvi (desno) sa kućištem kaiša, kućište pužnog prenosa
    g += lathe([(0.0, 0.0), (0.044, 0.0), (0.046, 0.016), (0.046, 0.150), (0.038, 0.165), (0.0, 0.165)], seg, ALU, axis="-x", hard=False).moved(-0.085, y, z + 0.068)
    g += rounded_box(0.050, 0.080, 0.110, 0.016, ALU, center=(-0.060, y, z + 0.040))
    g += rounded_box(0.040, 0.030, 0.036, 0.008, RUBBER, center=(-0.170, y - 0.040, z + 0.070))
    # pogonski zupčanik (vozačeva strana) sa kratkim međuvratilom i kardanskim zglobom
    g += lathe([(0.0, 0.0), (0.034, 0.0), (0.034, 0.080), (0.022, 0.090), (0.0, 0.090)], seg, ALU, axis="y", hard=False).moved(0.260, y, z)
    g += along(tube([V((0, 0, 0)), V((0, 0.10, 0))], 0.012, 10, STEEL), V((0.260, y + 0.090, z)), V((0.320, y + 0.200, z - 0.060)))
    g += lathe([(0.0, -0.016), (0.020, -0.012), (0.020, 0.012), (0.0, 0.016)], 12, STEEL, hard=False).moved(0.262, y + 0.100, z - 0.004)
    # manžetne, unutrašnji zglobovi i spone do krakova rukavaca
    for s in (-1, 1):
        g += bellows(0.016, 0.028, 0.110, 5, RUBBER, seg=12 if lite else 18).transform(axis_to("x" if s > 0 else "-x")).moved(s * 0.300, y, z)
        end = V((s * F_TIE.x, F_TIE.y, F_TIE.z))
        g += tube([V((s * 0.405, y, z)), end - V((s * 0.050, 0, 0))], 0.010, 10, STEEL, hard=False)
        g += rounded_box(0.050, 0.026, 0.030, 0.008, STEEL, center=(end.x - s * 0.045, end.y, end.z))  # 4 mm od kugle kraka rukavca
    if not lite:
        for x in (-0.285, 0.240):
            g += bolt((x, y - 0.031, z + 0.040), "-y", STEEL, af=0.014, h=0.007)
    return g


# --------------------------------------------------------------------------- pozadi


def rear_arms_left(lite: bool) -> Geo:
    g = Geo()
    for a, b, mat in R_LINKS:
        if mat == ALU:
            g += forged_arm(a, b, 0.038, 0.024, lite, bow=0.010)
        else:
            from lib.geo import rounded_rect, sweep

            path = [a.lerp(b, t / 6) for t in range(7)]
            g += sweep(path, rounded_rect(0.034, 0.022, 0.008, 2 if lite else 3), BLACK, up_hint=(0, 1, 0), hard=False)
        g += eye(a, "z", 0.024, 0.040, lite)
        g += eye(b, "z", 0.020, 0.034, lite)
    # donja zadnja poluga je široka (oslonac opruge)
    g += rounded_box(0.120, 0.012, 0.055, 0.018, BLACK, center=(0.600, 0.222, -1.5725))
    # liveni nosač točka sa ležištem glavčine i nosačem čeljusti
    hub = V((0.770, D.Y_WHEEL_R, ZR))
    g += box_tube([V((0.722, 0.190, -1.490)), V((0.735, 0.270, -1.490)), hub + V((-0.030, 0, 0)), V((0.718, 0.450, -1.495)), V((0.692, 0.565, -1.492))], 0.060, 0.090, ALU, r=0.018, fillet=0.06, up=(1, 0, 0))
    for a, b, _ in R_LINKS:
        g += box_tube([V((0.738, b.y, (b.z + ZR) / 2)), b], 0.026, 0.026, ALU, r=0.008)
    g += box_tube([hub + V((-0.030, 0.000, -0.040)), R_DAMP_LO + V((0.028, 0.026, 0.012))], 0.034, 0.030, ALU, r=0.010, up=(1, 0, 0))  # bez preklopa sa okom amortizera
    seg = 16 if lite else 32
    g += lathe([(0.0, -0.034), (0.066, -0.034), (0.070, -0.020), (0.070, 0.024), (0.062, 0.034), (0.0, 0.034)], seg, ALU, axis="x", hard=False).moved(*hub)
    xh = D.X_HUB_R
    g += lathe([(0.0, 0.0), (0.040, 0.0), (0.040, 0.050), (0.070, 0.054), (0.070, 0.064), (0.030, 0.066), (0.0, 0.066)], seg, ALU, axis="x", hard=False).moved(xh - 0.076, D.Y_WHEEL_R, ZR)
    return g


def subframe_rear(lite: bool) -> Geo:
    g = Geo()
    y = 0.250
    for s in (-1, 1):
        x = s * 0.360  # šine unutar unutrašnjih čaura poluga (čaure su u nosačima spolja)
        g += box_tube([V((x * 0.96, y + 0.010, -1.160)), V((x, y, -1.250)), V((x, y, -1.750)), V((x * 0.96, y + 0.030, -1.860))], 0.070, 0.060, BLACK, r=0.012, fillet=0.08)
        for z, dy in ((-1.175, 0.060), (-1.820, 0.032)):
            g += lathe([(0.0, 0.0), (0.042, 0.0), (0.042, 0.030), (0.036, 0.040), (0.0, 0.040)], 12 if lite else 24, RUBBER, axis="y", hard=False).moved(x * 0.96, y + dy, z)
        # stubovi za gornje poluge (ispred i iza poluosovine)
        for z in (-1.360, -1.600):
            g += box_tube([V((x, y + 0.030, z)), V((s * 0.448, 0.455, z))], 0.044, 0.036, BLACK, r=0.010, up=(0, 0, 1))
        for a, _, _ in R_LINKS:
            pa = V((s * a.x, a.y, a.z))
            for dz in (-0.028, 0.028):
                g += box(0.036, 0.046, 0.007, BLACK, center=(pa.x - s * 0.012, pa.y, pa.z + dz))
    for z in (-1.250, -1.750):
        g += box_tube([V((-0.430, y, z)), V((0.0, y - 0.010, z)), V((0.430, y, z))], 0.060, 0.060, BLACK, r=0.010, fillet=0.20)
    # nosači diferencijala (gumene čaure)
    for x, z in ((-0.10, -1.400), (0.10, -1.400), (-0.11, -1.600), (0.11, -1.600)):
        g += box_tube([V((x, y + 0.030, z + (0.150 if z > -1.5 else -0.150))), V((x, 0.400, z))], 0.036, 0.030, BLACK, r=0.008)
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    fa = front_arms_left(lite)
    ctx.add_part("ramena_prednja", "l", fa)
    ctx.add_part("ramena_prednja", "d", fa.mirrored_x())
    ra = rear_arms_left(lite)
    ctx.add_part("ramena_zadnja", "l", ra)
    ctx.add_part("ramena_zadnja", "d", ra.mirrored_x())
    sf = air_strut(F_DAMP_LO, F_DAMP_TOP, 0.062, (0.665, 0.805), lite)
    ctx.add_part("amortizer_prednji", "l", sf)
    ctx.add_part("amortizer_prednji", "d", sf.mirrored_x())
    sr = air_strut(R_DAMP_LO, R_DAMP_TOP, 0.072, (0.480, 0.665), lite)
    ctx.add_part("amortizer_zadnji", "l", sr)
    ctx.add_part("amortizer_zadnji", "d", sr.mirrored_x())
    ctx.add_part("stabilizator_prednji", "", stabilizer(1.800, 0.315, 0.0125, -1, [V((0.600, 0.232, 1.560))], lite))
    ctx.add_part("stabilizator_zadnji", "", stabilizer(-1.920, 0.260, 0.009, 1, [V((0.600, 0.252, -1.612))], lite, bx=0.28))  # iza krajeva šina podokvira
    ctx.add_part("podokvir_prednji", "", subframe_front(lite))
    ctx.add_part("podokvir_zadnji", "", subframe_rear(lite))
    ctx.add_part("letva_volana", "", rack(lite))
    _ = (R, box, look_axis)
