"""Usis i izduv (A08).

Usis: kutija filtera vazduha napred levo (donji deo, poklopac sa kopčama, merač protoka) ->
prelazna cev preko prednjeg kraja motora -> dva kolena do ulaza kompresora. Punjenje: izlazi oba
kompresora se spajaju u zajedničku cev desno uz blok -> interkuler dole napred -> cev levo do
tela leptira. Izduv: dve silazne cevi od turbina -> dva katalizatora u kanalu poda desno (lambda
sonde pre i posle) -> GPF -> srednji lonac ispod tunela -> dve cevi -> zadnji poprečni lonac sa
klapnama -> četiri izlaza Ø90 (A07). Vešanje izduva su gumeni držači.
"""

from __future__ import annotations

import math

from mathutils import Vector

from config import body as B
from lib.geo import Geo, R, box, catmull, cylinder, lathe, loft, polyline_fillet, rounded_box, superellipse2d, tube
from lib.shapes import hose
from parts.engine import TURBO, PLENUM

STEEL = "mat_steel"
SHIELD = "mat_heat_shield"
CHROME = "mat_chrome"
RUBBER = "mat_rubber"
PLASTIC = "mat_plastic"
ALU = "mat_alu"

V = Vector
AIRBOX = (0.455, 0.695, 1.85)  # centar kutije filtera
XOVER_Y, XOVER_Z = 0.742, 1.800  # prelazna usisna cev preko prednjeg kraja motora (ispred gornjeg creva)
CHARGE_X, CHARGE_Y = -0.245, 0.432  # zajednička cev punjenja desno uz blok
IC = (0.0, 0.300, 2.150)  # interkuler (A09: 20 mm unazad, iza više maske)
IC_END = 0.335  # x krajeva jezgra interkulera
IC_PORT = 0.424  # x kraja bočnog priključka interkulera
CAT_Y = 0.215
CATS = {"p": -0.440, "z": -0.322}  # katalizatori u kanalu poda: od prednjeg i od zadnjeg turba
GPF_X, GPF_Y = -0.385, 0.212


def oval_can(length: float, a: float, b: float, mat: str, cone: float = 0.05, r_pipe: float = 0.028, n: int = 24, seams: bool = True) -> Geo:
    """Ovalni lonac ili katalizator duž +z od 0 do length, sa konusnim krajevima i porubom."""
    sections = []
    prof = superellipse2d(a, b, 2.6, n)
    pipe = [(r_pipe * math.cos(2 * math.pi * i / n), r_pipe * math.sin(2 * math.pi * i / n)) for i in range(n)]
    stations = [(0.0, 0.0), (cone * 0.55, 0.72), (cone, 1.0)]
    if seams:
        stations += [(cone + 0.006, 1.03), (cone + 0.012, 1.0), (length - cone - 0.012, 1.0), (length - cone - 0.006, 1.03)]
    stations += [(length - cone, 1.0), (length - cone * 0.55, 0.72), (length, 0.0)]
    for z, k in stations:
        sections.append([(p[0] * k + q[0] * (1 - k), p[1] * k + q[1] * (1 - k), z) for p, q in zip(prof, pipe)])
    return loft(sections, mat, closed=True, caps=False, hard=False)


def can_between(p0, p1, a, b, mat, lite, **kw) -> Geo:
    """Ovalni lonac od p0 do p1 (osa lonca), velika osa vodoravna."""
    from lib.shapes import along

    p0, p1 = V(p0), V(p1)
    g = oval_can((p1 - p0).length, a, b, mat, n=14 if lite else 24, **kw)
    g.transform(R("x", -90))  # osa +z -> +y (along očekuje +y)
    return along(g, p0, p1)


def hanger(p, rod_up: float = 0.03) -> Geo:
    """Gumeni držač izduva: guma sa dve rupe i šipka ka podu."""
    g = rounded_box(0.040, 0.022, 0.014, 0.008, RUBBER, center=p)
    g += cylinder(0.004, rod_up, 8, RUBBER, axis="y", center=False).moved(p[0], p[1] + 0.008, p[2])
    return g


def pipe(points, r: float, lite: bool, mat: str = STEEL, fillet: float = 0.06) -> Geo:
    return tube(polyline_fillet(points, fillet, 6), r, 10 if lite else 16, mat)


def o2_sensor(p, d) -> Geo:
    """Lambda sonda: šestougao, telo i kabl, osa po smeru d (od cevi ka spolja)."""
    from lib.geo import look_axis, T

    g = lathe([(0.0, 0.0), (0.011, 0.0), (0.011, 0.008), (0.009, 0.010), (0.009, 0.040), (0.006, 0.050), (0.0, 0.052)], 12, STEEL, hard=False)
    return g.transform(T(*p) @ look_axis(V(d)))


# --------------------------------------------------------------------------- usis


def airbox(lite: bool) -> Geo:
    g = Geo()
    cx, cy, cz = AIRBOX
    n = 2 if lite else 4
    # donji deo i poklopac (blago prati haubu), rub sa kopčama
    g += rounded_box(0.240, 0.080, 0.250, 0.030, PLASTIC, center=(cx, cy - 0.035, cz), n=n)
    lid = rounded_box(0.236, 0.060, 0.246, 0.032, PLASTIC, center=(cx, cy + 0.040, cz), n=n)
    from lib.geo import T

    lid.transform(T(cx, cy, cz) @ R("x", 3.5) @ T(-cx, -cy, -cz))
    g += lid
    g += rounded_box(0.252, 0.010, 0.262, 0.034, PLASTIC, center=(cx, cy + 0.008, cz), n=n)
    if not lite:
        for dx, dz in ((-0.10, -0.08), (-0.10, 0.08), (0.10, -0.08), (0.10, 0.08)):
            g += box(0.012, 0.024, 0.016, PLASTIC, center=(cx + dx * 1.22, cy + 0.010, cz + dz * 1.4))
        for k in range(5):
            g += box(0.006, 0.008, 0.200, PLASTIC, center=(cx - 0.08 + 0.04 * k, cy + 0.072, cz))
    # usis hladnog vazduha (ka dole, iza branika) i izlaz sa meračem protoka (ka motoru)
    g += hose([V((cx + 0.040, cy - 0.070, cz + 0.090)), V((cx + 0.050, cy - 0.130, cz + 0.100)), V((cx + 0.060, cy - 0.190, cz + 0.080))], 0.040, 12 if lite else 18, PLASTIC)
    g += lathe([(0.040, 0.0), (0.046, 0.0), (0.046, 0.012), (0.040, 0.012)], 18, PLASTIC, axis="y", hard=False).moved(cx + 0.060, cy - 0.205, cz + 0.080)
    g += lathe([(0.0, 0.0), (0.038, 0.0), (0.038, 0.050), (0.035, 0.060), (0.0, 0.060)], 18 if lite else 28, PLASTIC, axis="-x", hard=False).moved(cx - 0.118, XOVER_Y - 0.010, XOVER_Z)
    g += rounded_box(0.030, 0.030, 0.040, 0.006, PLASTIC, center=(cx - 0.150, XOVER_Y + 0.040, XOVER_Z))
    return g


def charge_pipes(lite: bool) -> Geo:
    """Usisne cevi (plastika, do kompresora) i cevi punjenja (aluminijum, do interkulera i leptira)."""
    g = Geo()
    sides = 12 if lite else 20
    tp, tz = TURBO["p"], TURBO["z"]
    inlet_p = V((tp.x, tp.y, tp.z + 0.128))
    inlet_z = V((tz.x, tz.y, tz.z + 0.128))
    xr = -0.405  # prelazna cev se spušta desno, iza nosača gornjeg ramena
    # prelazna cev preko prednjeg kraja motora
    x0 = AIRBOX[0] - 0.181  # 3 mm od izlaza kutije (bez preklopa)
    g += pipe([(x0, XOVER_Y - 0.010, XOVER_Z), (0.10, XOVER_Y, XOVER_Z), (-0.30, XOVER_Y, XOVER_Z), (xr, XOVER_Y - 0.012, XOVER_Z - 0.050), (xr, 0.728, 1.660)], 0.036, lite, PLASTIC, fillet=0.07)
    # zadnja grana iznad prednjeg turba do kolena zadnjeg turba
    g += pipe([(xr, 0.728, 1.660), (xr, 0.726, 1.400), (inlet_z.x - 0.010, 0.722, inlet_z.z + 0.032), (inlet_z.x, 0.640, inlet_z.z + 0.034)], 0.032, lite, PLASTIC, fillet=0.045)
    g += hose([V((inlet_z.x, 0.650, inlet_z.z + 0.034)), V((inlet_z.x, 0.580, inlet_z.z + 0.032)), V((inlet_z.x, inlet_z.y + 0.010, inlet_z.z + 0.024)), V((inlet_z.x, inlet_z.y, inlet_z.z + 0.003))], 0.036, sides, PLASTIC, samples=5)
    # prednja grana do kolena prednjeg turba
    g += hose([V((xr, 0.728, 1.660)), V((inlet_p.x - 0.004, 0.690, inlet_p.z + 0.050)), V((inlet_p.x, inlet_p.y + 0.090, inlet_p.z + 0.040)), V((inlet_p.x, inlet_p.y + 0.012, inlet_p.z + 0.020)), V((inlet_p.x, inlet_p.y, inlet_p.z + 0.003))], 0.036, sides, PLASTIC, samples=5)
    # punjenje: izlaz zadnjeg kompresora (dole, ka bloku) -> zajednička cev uz blok
    oz = V((tz.x + 0.050, tz.y + 0.058, tz.z + 0.050))  # vrh kompresora, izlaz ka bloku
    g += pipe([(oz.x, oz.y, oz.z), (oz.x + 0.040, oz.y - 0.004, oz.z), (CHARGE_X - 0.008, 0.500, oz.z + 0.025), (CHARGE_X, CHARGE_Y, oz.z + 0.080), (CHARGE_X, CHARGE_Y, 1.62), (-0.330, CHARGE_Y - 0.010, 1.72),
               (-0.420, 0.390, 1.84), (-0.440, 0.320, 2.000), (-0.445, IC[1], IC[2] - 0.030), (-IC_PORT - 0.002, IC[1], IC[2])], 0.031, lite, ALU, fillet=0.05)
    # izlaz prednjeg kompresora (gore, ka bloku) se uliva u zajedničku cev
    op = V((tp.x + 0.050, tp.y + 0.058, tp.z + 0.050))
    g += pipe([(op.x, op.y, op.z), (op.x + 0.030, op.y, op.z), (CHARGE_X - 0.010, CHARGE_Y + 0.040, op.z + 0.030), (CHARGE_X, CHARGE_Y + 0.010, op.z + 0.090)], 0.026, lite, ALU, fillet=0.03)
    # interkuler -> telo leptira (levo, ispod kutije filtera)
    px, py = PLENUM
    g += pipe([(IC_PORT + 0.002, IC[1], IC[2]), (0.445, IC[1], IC[2] - 0.030), (0.440, 0.330, 2.000), (0.415, 0.460, 1.870), (0.370, 0.585, 1.720), (px, py, 1.700), (px, py, 1.640)], 0.031, lite, ALU, fillet=0.05)
    # gumene spojnice (obujmice) na krajevima
    for p, d in (((-IC_PORT - 0.024, IC[1], IC[2]), "x"), ((IC_PORT + 0.024, IC[1], IC[2]), "x"), ((px, py, 1.665), "z")):
        g += lathe([(0.032, -0.020), (0.036, -0.020), (0.036, 0.020), (0.032, 0.020)], sides, PLASTIC, axis=d, hard=False).moved(*p)
    return g


# --------------------------------------------------------------------------- izduv


def cats(lite: bool) -> Geo:
    """Silazne cevi od oba turba i dva katalizatora u kanalu poda (prednje lambda sonde)."""
    g = Geo()
    tp, tz = TURBO["p"], TURBO["z"]
    op = V((tp.x, tp.y, tp.z - 0.122))
    oz = V((tz.x, tz.y, tz.z - 0.122))
    xa, xb = CATS["p"], CATS["z"]
    g += pipe([op, (op.x, op.y, op.z - 0.030), (op.x - 0.012, 0.340, op.z - 0.075), (-0.412, 0.296, 1.180), (-0.410, 0.292, 1.000), (xa, 0.262, 0.905), (xa, CAT_Y, 0.858)], 0.028, lite, fillet=0.05)
    g += pipe([oz, (oz.x, oz.y, oz.z - 0.025), (-0.345, 0.420, 0.955), (-0.305, 0.320, 0.925), (xb, 0.250, 0.890), (xb, CAT_Y, 0.858)], 0.028, lite, fillet=0.05)
    for x in (xa, xb):
        can = oval_can(0.275, 0.054, 0.048, STEEL, cone=0.055, r_pipe=0.028, n=14 if lite else 24).transform(R("y", 180))
        g += can.moved(x, CAT_Y, 0.855)
        if not lite:
            g += o2_sensor(V((x + 0.012, CAT_Y + 0.020, 0.874)), V((0.30, 1.0, 0.05)))
    # toplotni štit iznad katalizatora
    g += box(0.220, 0.004, 0.360, SHIELD, center=(-0.360, 0.276, 0.700))  # unutar ivica kanala (pri rasklapanju ide ispod poda)
    return g


def gpf(lite: bool) -> Geo:
    g = Geo()
    xa, xb = CATS["p"], CATS["z"]
    for x in (xa, xb):
        g += pipe([(x, CAT_Y, 0.580), (x, CAT_Y, 0.560), ((x + GPF_X) / 2, GPF_Y, 0.530), (GPF_X, GPF_Y, 0.502)], 0.028, lite, fillet=0.03)
    g += can_between((GPF_X, GPF_Y, 0.500), (GPF_X, GPF_Y, 0.140), 0.088, 0.052, STEEL, lite, cone=0.065, r_pipe=0.030)
    if not lite:
        # lambda sonde posle katalizatora i vodovi senzora razlike pritiska
        g += o2_sensor(V((GPF_X + 0.040, GPF_Y + 0.030, 0.518)), V((0.4, 1.0, 0.0)))
        g += hose([V((GPF_X + 0.050, GPF_Y + 0.040, 0.460)), V((GPF_X + 0.080, GPF_Y + 0.052, 0.34)), V((GPF_X + 0.050, GPF_Y + 0.040, 0.180))], 0.004, 6, STEEL)
        g += rounded_box(0.030, 0.020, 0.040, 0.005, STEEL, center=(GPF_X + 0.085, GPF_Y + 0.052, 0.29))
    g += box(0.160, 0.004, 0.380, SHIELD, center=(GPF_X - 0.005, 0.272, 0.320))
    return g


def mid_muffler(lite: bool) -> Geo:
    g = Geo()
    g += pipe([(GPF_X, GPF_Y, 0.135), (GPF_X, 0.188, 0.105), (-0.300, 0.178, 0.030), (-0.150, 0.180, -0.060), (-0.020, 0.196, -0.115), (0.0, 0.200, -0.150)], 0.030, lite, fillet=0.04)
    g += can_between((0.0, 0.200, -0.150), (0.0, 0.200, -0.600), 0.116, 0.056, STEEL, lite, cone=0.060, r_pipe=0.030)
    for s in (-1, 1):
        g += pipe([(s * 0.045, 0.195, -0.590), (s * 0.070, 0.180, -0.700), (s * 0.070, 0.175, -1.150), (s * 0.150, 0.175, -1.260), (s * 0.245, 0.175, -1.330)], 0.026, lite)
    g += hanger((0.0, 0.262, -0.380), rod_up=0.010)
    g += hanger((0.070, 0.207, -1.000), rod_up=0.006)
    g += hanger((-0.070, 0.207, -1.000), rod_up=0.006)
    return g


def rear_muffler(lite: bool) -> Geo:
    g = Geo()
    for s in (-1, 1):
        g += pipe([(s * 0.245, 0.175, -1.330), (s * 0.262, 0.175, -1.700), (s * 0.268, 0.190, -1.980), (s * 0.268, 0.205, -2.070)], 0.026, lite)
    n = 16 if lite else 28
    # poprečni lonac: ovalni presek u ravni y-z, osa po x
    secs = []
    prof = superellipse2d(0.078, 0.064, 2.8, n)  # (z, y)
    for x, k in ((-0.56, 0.0), (-0.548, 0.86), (-0.535, 1.0), (-0.528, 1.04), (-0.521, 1.0), (0.521, 1.0), (0.528, 1.04), (0.535, 1.0), (0.548, 0.86), (0.56, 0.0)):
        kk = max(k, 0.25)
        secs.append([(x, 0.220 + py * kk, -2.160 + pz * kk) for pz, py in prof])
    g += loft(secs, STEEL, closed=True, caps=True, hard=False)
    seg = 16 if lite else 28
    # četiri okrugla izlaza Ø90 sa duplim zidom (A07); A09: u otvorima zadnje maske difuzora, ivica
    # izlaza 8 mm ispred ravni zadnje plohe branika (oko 10–20 mm iza lica maske)
    tips = [(s * tx, ty) for tx, ty in B.EXHAUST_TIPS for s in (1, -1)]
    L = 0.10
    for x, y in tips:
        z_out = B.rear_face_z(abs(x)) + 0.008
        g += pipe([(x * 0.92, 0.228, -2.230), (x, y, -2.275), (x, y, z_out + L + 0.005)], 0.030, lite, fillet=0.03)  # poslednji deo pravo duž z
        r = B.TIP_R
        prof_t = [(r - 0.003, 0.0), (r, 0.004), (r, L - 0.004), (r - 0.001, L), (r - 0.005, L + 0.0005), (r - 0.008, L - 0.003),
                  (r - 0.009, L - 0.014), (r - 0.009, 0.0), (r - 0.003, 0.0)]
        g += lathe(prof_t, seg, CHROME, axis="-z", hard=False).moved(x, y, z_out + L)
        g += cylinder(r - 0.009, 0.004, seg, STEEL, axis="z").moved(x, y, z_out + 0.05)
    # aktuator klapne i držači
    if not lite:
        g += rounded_box(0.050, 0.040, 0.040, 0.008, STEEL, center=(0.300, 0.250, -2.090))
    for x in (-0.46, 0.46):
        g += hanger((x, 0.284, -2.160), rod_up=0.004)
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    ctx.add_part("filter_vazduha", "", airbox(lite))
    ctx.add_part("usisne_cevi", "", charge_pipes(lite))
    ctx.add_part("katalizator", "", cats(lite))
    ctx.add_part("gpf", "", gpf(lite))
    ctx.add_part("srednji_lonac", "", mid_muffler(lite))
    ctx.add_part("zadnji_lonac", "", rear_muffler(lite))
