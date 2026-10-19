"""Gorivo i energija (A08).

Sedlasti rezervoar 68 l ispod zadnjeg sedišta (HDPE, zaobljen, rebra, dve čelične trake, prirubnica
davača nivoa levo), grlo goriva sa odzračnim vodom do poklopca na desnom zadnjem blatobranu,
vodovi do priključka ispred rezervoara; pumpa u rezervoaru (modul sa prirubnicom i konektorom);
visokopritisna pumpa na zadnjem kraju glave sa vodom i razvodnikom sa šest brizgaljki;
baterija 48 V (Li-ion, aluminijumsko kućište sa rebrima i DC/DC pretvaračem) i akumulator 12 V
(AGM) u prtljažniku.
"""

from __future__ import annotations

import math

from mathutils import Vector

from lib.geo import Geo, box, cylinder, extrude, lathe, loft, rounded_box, rounded_rect, tube, catmull
from lib.shapes import bolt, hose
from parts.engine import CY, CYL_Z, PORT_X, PORT_Y

PLASTIC = "mat_plastic"
STEEL = "mat_steel"
ALU = "mat_alu"
RUBBER = "mat_rubber"

V = Vector
TANK_Z0, TANK_Z1 = -1.100, -0.680
PUMP = (0.320, -0.860)  # (x, z) pumpa i servisni otvor u levoj polovini sedla
SENDER = (-0.320, -0.880)
TANK_TOP = 0.425
HP = (0.200, CY + 0.395, 1.030)  # visokopritisna pumpa na nosaču glave


def _chaikin(poly, n=2):
    pts = [V((x, y)) for x, y in poly]
    for _ in range(n):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        pts = out
    return [(p.x, p.y) for p in pts]


def tank(lite: bool) -> Geo:
    g = Geo()
    # sedlo od dve polovine i mosta iznad tunela (izvlačenje tlocrta po visini); leva polovina ima
    # otvor za modul pumpe (servisni otvor, A01 §2.4) sa dnom; ivice zaobljava bevel pri dodavanju
    from mathutils import Matrix

    to_y = lambda y0: Matrix(((1, 0, 0, 0), (0, 0, 1, y0), (0, -1, 0, 0), (0, 0, 0, 1)))  # (x, -z, d) -> (x, y0 + d, z)
    n = 3 if lite else 5
    seg = 16 if lite else 32
    zc, zd = -(TANK_Z0 + TANK_Z1) / 2, TANK_Z1 - TANK_Z0
    top = TANK_TOP + 0.012
    pump_hole = [(PUMP[0] + 0.058 * math.cos(2 * math.pi * k / seg), -PUMP[1] + 0.058 * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    for s in (1, -1):
        outline = rounded_rect(0.325, zd, 0.040, n, cx=s * 0.3425, cy=zc)
        g += extrude(outline, top - 0.225, PLASTIC, holes=[pump_hole] if s > 0 else [], hard=True, z0=0.0).transform(to_y(0.225))
    g += extrude(rounded_rect(0.400, zd - 0.020, 0.020, n, cx=0.0, cy=zc), top - 0.416, PLASTIC, hard=True, z0=0.0).transform(to_y(0.416))  # 6 mm iznad tunela poda
    g += cylinder(0.058, 0.008, seg, PLASTIC, axis="y", center=False).moved(PUMP[0], 0.226, PUMP[1])
    # rebra na vrhu i prirubnica davača nivoa (leva polovina)
    if not lite:
        for x in (-0.40, -0.26, 0.20, 0.42):
            g += box(0.012, 0.008, 0.340, PLASTIC, center=(x, TANK_TOP + 0.002, (TANK_Z0 + TANK_Z1) / 2))
    g += lathe([(0.0, 0.0), (0.060, 0.0), (0.060, 0.010), (0.050, 0.014), (0.0, 0.014)], 16 if lite else 32, PLASTIC, hard=False).moved(SENDER[0], TANK_TOP, SENDER[1])
    # dve čelične trake ispod oba dela sedla, sa vijcima ka podu
    for z in (TANK_Z0 + 0.090, TANK_Z1 - 0.090):
        for s in (-1, 1):
            pts = [V((s * 0.525, 0.415, z)), V((s * 0.520, 0.240, z)), V((s * 0.500, 0.219, z)), V((s * 0.180, 0.219, z)), V((s * 0.160, 0.235, z))]
            from lib.shapes import box_tube

            g += box_tube(pts, 0.004, 0.030, STEEL, r=0.0015, fillet=0.02, up=(0, 0, 1))
    # grlo goriva: od desnog kraja, spolja oko klupe, preko luka do poklopca na blatobranu
    neck = [V((-0.470, 0.400, -0.980)), V((-0.600, 0.412, -1.000)), V((-0.745, 0.425, -1.030)), V((-0.800, 0.560, -1.060)), V((-0.830, 0.790, -1.170)),
            V((-0.850, 0.815, -1.600)), V((-0.885, 0.820, -1.930)), V((-0.915, 0.822, -1.990))]
    g += tube(catmull(neck, 4 if lite else 7), 0.026, 10 if lite else 16, PLASTIC, hard=False)
    g += tube(catmull([p + V((0.030, 0.030, 0.0)) for p in neck[2:]], 3 if lite else 5), 0.006, 6, PLASTIC, hard=False)
    g += lathe([(0.0, 0.0), (0.040, 0.0), (0.042, 0.012), (0.036, 0.030), (0.0, 0.032)], 16 if lite else 28, PLASTIC, axis="-x", hard=False).moved(-0.915, 0.822, -1.995)
    # napojni i povratni vod od pumpe preko rezervoara do priključka ispred njega
    for dx in (0.0, 0.016):
        pts = [(0.452, PUMP[1] + 0.085), (0.451, TANK_Z1 - 0.030), (0.440, TANK_Z1 - 0.012), (0.420, TANK_Z1 + 0.0075), (0.330, TANK_Z1 + 0.0075), (0.240, TANK_Z1 + 0.0075),
               (0.218, TANK_Z1 + 0.008), (0.212, TANK_Z1 + 0.040), (0.207, TANK_Z1 + 0.080), (0.207, -0.450)]
        g += tube([V((PUMP[0] - 0.050 + dx, y, z)) for y, z in pts], 0.005, 6, STEEL, hard=False)
    g += rounded_box(0.050, 0.020, 0.040, 0.006, PLASTIC, center=(PUMP[0] - 0.022, 0.207, -0.440))
    return g


def pump(lite: bool) -> Geo:
    g = Geo()
    x, z = PUMP
    seg = 16 if lite else 32
    # modul u rezervoaru (čaša sa pumpom i filterom) ispod prirubnice
    g += lathe([(0.0, 0.0), (0.050, 0.0), (0.052, 0.010), (0.052, 0.150), (0.046, 0.160), (0.0, 0.160)], seg, PLASTIC, hard=False).moved(x, 0.250, z)
    g += cylinder(0.022, 0.120, 16, STEEL, axis="y", center=False).moved(x + 0.020, 0.262, z - 0.010)
    # prirubnica sa prstenom za zatezanje, konektor i dva nastavka voda
    top = TANK_TOP + 0.013  # prirubnica leži na rezervoaru, modul je u otvoru
    g += lathe([(0.0, 0.0), (0.072, 0.0), (0.072, 0.006), (0.064, 0.010), (0.0, 0.010)], seg, STEEL, hard=False).moved(x, top, z)
    g += lathe([(0.0, 0.0), (0.050, 0.0), (0.050, 0.012), (0.038, 0.018), (0.0, 0.018)], seg, PLASTIC, hard=False).moved(x, top + 0.006, z)
    g += rounded_box(0.030, 0.016, 0.022, 0.004, PLASTIC, center=(x + 0.030, top + 0.028, z + 0.012))
    for dx in (0.0, 0.016):
        g += cylinder(0.006, 0.016, 8, STEEL, axis="y", center=False).moved(x - 0.050 + dx, top + 0.008, z + 0.020)
    return g


def hp_pump(lite: bool) -> Geo:
    """Visokopritisna pumpa (pogon sa bregaste), vod 350 bar i razvodnik sa šest brizgaljki."""
    g = Geo()
    x, y, z = HP
    seg = 16 if lite else 28
    g += lathe([(0.0, 0.0), (0.034, 0.0), (0.036, 0.010), (0.036, 0.070), (0.030, 0.085), (0.0, 0.088)], seg, ALU, hard=False).moved(x, y - 0.020, z)
    g += rounded_box(0.080, 0.012, 0.050, 0.010, ALU, center=(x, y - 0.014, z))
    g += cylinder(0.012, 0.030, 12, ALU, axis="x", center=False).moved(x + 0.030, y + 0.040, z)
    g += rounded_box(0.026, 0.020, 0.030, 0.005, ALU, center=(x + 0.044, y + 0.050, z))
    # razvodnik (rail) duž glave sa strane usisa, ispod kanala usisne grane
    rail_x, rail_y = PORT_X + 0.036, PORT_Y - 0.052
    za, zb = CYL_Z[-1] - 0.030, CYL_Z[0] + 0.030
    g += tube([V((rail_x, rail_y, za)), V((rail_x, rail_y, zb))], 0.011, 12 if lite else 16, STEEL, hard=False)
    for zc in CYL_Z:
        g += tube([V((rail_x, rail_y - 0.004, zc)), V((PORT_X + 0.002, rail_y - 0.010, zc))], 0.007, 8, STEEL, hard=False)
        g += cylinder(0.010, 0.012, 10, STEEL, axis="x").moved(PORT_X + 0.008, rail_y - 0.010, zc)
    # vod 350 bar od pumpe do razvodnika
    g += hose([V((x + 0.040, y + 0.040, z + 0.005)), V((0.185, y + 0.004, 1.040)), V((0.168, rail_y + 0.022, 1.046)), V((rail_x + 0.004, rail_y + 0.004, za + 0.006))], 0.004, 6, STEEL)
    return g


def battery_48v(lite: bool) -> Geo:
    g = Geo()
    c = V((0.400, 0.408, -2.060))
    w, h, d = 0.300, 0.170, 0.240
    g += rounded_box(w, h, d, 0.012, ALU, center=c)
    if not lite:
        for k in range(9):
            g += box(0.004, h * 0.70, d + 0.006, ALU, center=(c.x - w / 2 + 0.030 + 0.030 * k, c.y - 0.010, c.z))
    # DC/DC pretvarač na vrhu, priključci 48 V (+/–), konektor komunikacije
    g += rounded_box(0.160, 0.040, 0.120, 0.008, ALU, center=(c.x - 0.040, c.y + h / 2 + 0.020, c.z + 0.030))
    for dx in (0.090, 0.120):
        g += cylinder(0.012, 0.024, 12, STEEL, axis="y", center=False).moved(c.x + dx, c.y + h / 2, c.z - 0.070)
    g += rounded_box(0.040, 0.020, 0.030, 0.006, PLASTIC, center=(c.x + 0.100, c.y + h / 2 + 0.010, c.z + 0.070))
    # nosač sa ušima ka podu prtljažnika
    for dz in (-d / 2 - 0.012, d / 2 + 0.012):
        g += box(w + 0.040, 0.008, 0.024, ALU, center=(c.x, c.y - h / 2 + 0.006, c.z + dz))
    return g


def battery_12v(lite: bool) -> Geo:
    g = Geo()
    c = V((-0.420, 0.413, -2.060))
    w, h, d = 0.350, 0.180, 0.175
    g += rounded_box(w, h, d, 0.008, PLASTIC, center=c)
    g += rounded_box(w + 0.006, 0.024, d + 0.006, 0.010, PLASTIC, center=(c.x, c.y + h / 2 - 0.004, c.z))
    if not lite:
        for k in range(6):
            g += cylinder(0.010, 0.006, 10, PLASTIC, axis="y").moved(c.x - 0.12 + 0.048 * k, c.y + h / 2 + 0.010, c.z)
    # polovi sa kleme i senzorom struje na minusu
    for dx, r in ((-0.130, 0.011), (0.130, 0.010)):
        g += lathe([(0.0, 0.0), (r, 0.0), (r * 0.9, 0.020), (0.0, 0.020)], 12, STEEL, hard=False).moved(c.x + dx, c.y + h / 2 + 0.008, c.z - 0.050)
        g += rounded_box(0.034, 0.016, 0.026, 0.004, STEEL, center=(c.x + dx, c.y + h / 2 + 0.020, c.z - 0.050))
    g += rounded_box(0.040, 0.030, 0.034, 0.006, PLASTIC, center=(c.x - 0.130, c.y + h / 2 + 0.030, c.z - 0.010))
    # držač (ploča preko ivice)
    g += box(0.030, 0.012, d + 0.040, STEEL, center=(c.x + 0.150, c.y - h / 2 + 0.030, c.z))
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    ctx.add_part("rezervoar", "", tank(lite), bevel=0.0 if lite else 0.014, segments=3)
    ctx.add_part("pumpa_goriva", "", pump(lite))
    ctx.add_part("visokopritisna_pumpa", "", hp_pump(lite))
    ctx.add_part("baterija_48v", "", battery_48v(lite))
    ctx.add_part("akumulator_12v", "", battery_12v(lite))
    _ = (math, bolt, RUBBER)
