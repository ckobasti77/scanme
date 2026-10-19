"""Elektrika (A08): upravljačka jedinica motora (rebrasto aluminijumsko kućište sa dva konektora)
i glavni kablovski snop kao kriva cev sa granama: motorni snop (ECU -> uz usisnu granu -> bobine),
prednji (kutija osigurača -> farovi i ventilator), kabinski (kroz zid, uz levi prag, preko luka
do prtljažnika i baterija). Kutija osigurača je na levoj strani protivpožarnog zida."""

from __future__ import annotations

from mathutils import Vector

from lib.geo import Geo, box, catmull, rounded_box, tube
from lib.shapes import hose

ALU = "mat_alu"
PLASTIC = "mat_plastic"

V = Vector
ECU = (0.640, 0.640, 1.120)
FUSE = (0.720, 0.660, 0.888)


def ecu(lite: bool) -> Geo:
    x, y, z = ECU
    g = rounded_box(0.200, 0.040, 0.180, 0.008, ALU, center=(x, y, z))
    if not lite:
        for k in range(8):
            g += box(0.180, 0.010, 0.004, ALU, center=(x, y + 0.025, z - 0.07 + 0.02 * k))
    for dx in (-0.050, 0.050):
        g += rounded_box(0.070, 0.036, 0.034, 0.006, PLASTIC, center=(x + dx, y + 0.008, z + 0.105))
    for dz in (-0.075, 0.075):
        g += box(0.230, 0.006, 0.020, ALU, center=(x, y - 0.020, z + dz))
    return g


def harness(lite: bool) -> Geo:
    g = Geo()
    sides = 6 if lite else 10
    s = 4 if lite else 7

    def run(pts, r):
        nonlocal g
        g += tube(catmull([V(p) for p in pts], s), r, sides, PLASTIC, hard=False)

    ex, ey, ez = ECU
    # motorni snop: ECU -> spolja uz usisnu granu (izvan putanje plenuma pri rasklapanju)
    run([(ex - 0.040, ey + 0.030, ez + 0.125), (0.520, 0.728, 1.230), (0.432, 0.745, 1.320), (0.432, 0.748, 1.540), (0.440, 0.762, 1.640)], 0.011)
    for zc in (1.10, 1.28, 1.46):  # grane ka brizgaljkama i senzorima
        run([(0.432, 0.745, zc), (0.420, 0.752, zc + 0.010), (0.410, 0.750, zc + 0.020)], 0.005)
    fx, fy, fz = FUSE
    # prednji snop: uz levi unutrašnji blatobran, iznad hladnjaka, do farova i ventilatora
    front = [(fx, fy + 0.040, fz + 0.050), (0.700, 0.730, 1.150), (0.700, 0.745, 1.700), (0.660, 0.765, 1.960), (0.640, 0.735, 2.025)]
    run(front, 0.009)
    # kabinski snop: pored zida, niz levi prag (uz vrata), preko zadnjeg luka do prtljažnika i baterija
    cabin = [(fx + 0.050, fy - 0.020, fz - 0.040), (0.770, 0.560, 0.760), (0.750, 0.330, 0.600), (0.750, 0.292, 0.400), (0.750, 0.292, -0.900), (0.750, 0.320, -1.040),
             (0.750, 0.700, -1.070), (0.750, 0.820, -1.200), (0.700, 0.825, -1.550), (0.620, 0.805, -1.750), (0.550, 0.620, -1.840), (0.480, 0.480, -1.895)]
    run(cabin, 0.011)
    run([(p[0] + 0.016, p[1] + 0.004, p[2]) for p in cabin[3:6]], 0.006)  # tanji paralelni krak duž praga
    if not lite:  # obujmice snopa na podu i na luku
        for p in ((0.750, 0.292, 0.200), (0.750, 0.292, -0.300), (0.750, 0.292, -0.800), (0.750, 0.820, -1.250), (0.690, 0.824, -1.600)):
            g += rounded_box(0.034, 0.010, 0.016, 0.004, PLASTIC, center=(p[0] + 0.008, p[1] - 0.012, p[2]))
    run([(0.480, 0.480, -1.895), (0.200, 0.400, -1.893), (-0.200, 0.400, -1.893), (-0.420, 0.400, -1.945)], 0.010)
    # kutija osigurača sa poklopcem
    g += rounded_box(0.160, 0.060, 0.120, 0.010, PLASTIC, center=FUSE)
    g += rounded_box(0.150, 0.016, 0.110, 0.012, PLASTIC, center=(fx, fy + 0.034, fz))
    return g


def build(ctx, only=None) -> None:
    if only is not None and "elektrika" not in only:
        return
    ctx.add_part("ecu_motora", "", ecu(ctx.lite))
    ctx.add_part("kablovski_snop", "", harness(ctx.lite))
    _ = hose
