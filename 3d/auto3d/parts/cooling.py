"""Hlađenje (A08): hladnjak sa plastičnim bočnim rezervoarima i lamelama, interkuler vazduh-vazduh
sa aluminijumskim krajevima, ventilator 600 W u kućištu (7 zakrivljenih lopatica), providna
ekspanziona posuda sa čepom i creva (gornje, donje, posuda, grejač kabine) sa obujmicama."""

from __future__ import annotations

import math

from mathutils import Vector

from lib.geo import Geo, R, T, box, cylinder, lathe, radial, rounded_box, rounded_rect, extrude, sweep, catmull
from lib.shapes import hose
from parts.intake_exhaust import IC, IC_END

FINS = "mat_fins"
PLASTIC = "mat_plastic"
LIGHT = "mat_plastic_light"
ALU = "mat_alu"
RUBBER = "mat_rubber"

V = Vector
RAD = (0.0, 0.490, 2.050)  # centar jezgra hladnjaka
RAD_W, RAD_H, RAD_T = 0.620, 0.450, 0.040
FAN_Z = 1.968
TANK = (-0.600, 0.690, 1.820)
THERMO = (-0.070, 0.728, 1.706)  # izlaz termostata na prednjem poklopcu motora (blok)
PUMP_IN = (-0.239, 0.600, 1.646)  # 3 mm od bočnog usisa pumpe vode (iza ravni kaiša)


def core(w: float, h: float, t: float, center, lite: bool, pitch: float) -> Geo:
    """Jezgro: okvir i vodoravne cevi sa lamelama (bez tekstura)."""
    g = Geo()
    cx, cy, cz = center
    g += box(w, h, t * 0.6, FINS, center=center)
    n = int(h / (pitch * (2.0 if lite else 1.0)))
    for i in range(n):
        y = cy - h / 2 + (i + 0.5) * h / n
        g += box(w, 0.0025, t, FINS, center=(cx, y, cz))
    for s in (-1, 1):
        g += box(w + 0.004, 0.010, t + 0.004, FINS, center=(cx, cy + s * (h / 2 + 0.005), cz))
    return g


def radiator(lite: bool) -> Geo:
    cx, cy, cz = RAD
    g = core(RAD_W, RAD_H, RAD_T, RAD, lite, 0.012)
    seg = 12 if lite else 20
    for s in (-1, 1):
        x = cx + s * (RAD_W / 2 + 0.026)
        g += rounded_box(0.052, RAD_H + 0.030, RAD_T + 0.016, 0.014, PLASTIC, center=(x, cy, cz))
        if not lite:
            for k in range(6):
                g += box(0.004, 0.006, RAD_T + 0.020, PLASTIC, center=(x + s * 0.026, cy - 0.18 + 0.072 * k, cz))
        # gumeni čepovi za nosač (gore i dole)
        g += cylinder(0.010, 0.020, 10, PLASTIC, axis="y").moved(x, cy + RAD_H / 2 + 0.024, cz)
    # priključci: gornji desno (od termostata), donji levo i desno, odzračivanje ka posudi
    g += cylinder(0.022, 0.050, seg, PLASTIC, axis="-z", center=False).moved(-RAD_W / 2 - 0.026, cy + 0.170, cz - 0.020)
    g += cylinder(0.022, 0.050, seg, PLASTIC, axis="-z", center=False).moved(-RAD_W / 2 - 0.026, cy - 0.185, cz - 0.020)
    return g


def intercooler(lite: bool) -> Geo:
    cx, cy, cz = IC
    w, h, t = 0.600, 0.180, 0.060
    g = core(w, h, t, IC, lite, 0.010)
    seg = 14 if lite else 24
    for s in (-1, 1):
        x = cx + s * (w / 2 + 0.018)
        g += rounded_box(0.036, h + 0.016, t + 0.010, 0.010, ALU, center=(x, cy, cz))
        # priključak bočno (cevi punjenja idu spolja oko hladnjaka)
        g += lathe([(0.0, 0.0), (0.032, 0.0), (0.032, 0.006), (0.029, 0.010), (0.029, 0.060), (0.033, 0.064), (0.029, 0.068)], seg, ALU, axis="x" if s > 0 else "-x", hard=False).moved(x + s * 0.016, cy, cz)
        g += box(0.024, 0.020, 0.024, ALU, center=(x + s * 0.020, cy + h / 2 - 0.010, cz))
    return g


def fan(lite: bool) -> Geo:
    g = Geo()
    cx, cy = RAD[0], RAD[1]
    seg = 28 if lite else 56
    # kućište (ploča sa otvorom i kratkim prstenom), krajevi naslonjeni na rezervoare hladnjaka
    plate = extrude(rounded_rect(0.600, 0.450, 0.030, 3), 0.010, PLASTIC, holes=[[(0.205 * math.cos(2 * math.pi * i / seg), 0.205 * math.sin(2 * math.pi * i / seg)) for i in range(seg)]])
    g += plate.moved(cx, cy, FAN_Z + 0.020)
    g += lathe([(0.205, 0.0), (0.214, 0.0), (0.214, 0.050), (0.205, 0.050), (0.205, 0.0)], seg, PLASTIC, axis="z", hard=False).moved(cx, cy, FAN_Z - 0.030)
    # žbice nosača motora
    for a in (90, 210, 330):
        r = math.radians(a)
        p0 = V((cx + 0.075 * math.cos(r), cy + 0.075 * math.sin(r), FAN_Z - 0.026))
        p1 = V((cx + 0.212 * math.cos(r), cy + 0.212 * math.sin(r), FAN_Z - 0.026))
        from lib.shapes import box_tube

        g += box_tube([p0, p1], 0.012, 0.010, PLASTIC, r=0.003)
    # motor i glavčina
    g += lathe([(0.0, 0.0), (0.072, 0.0), (0.075, 0.010), (0.075, 0.040), (0.060, 0.050), (0.0, 0.050)], 32 if not lite else 16, PLASTIC, axis="z", hard=False).moved(cx, cy, FAN_Z - 0.040)
    # sedam zakrivljenih lopatica sa nagibom
    blade = Geo()
    nr = 4 if lite else 8
    rows = []
    for i in range(nr + 1):
        r = 0.065 + (0.198 - 0.065) * i / nr
        sweep_a = math.radians(14 + 10 * i / nr)
        chord = 0.055 + 0.045 * i / nr
        row = []
        for j in range(4):
            u = j / 3 - 0.5
            a = sweep_a * u * 2 + math.radians(18) * (i / nr) ** 2
            row.append(V((r * math.cos(a), r * math.sin(a), u * chord * 0.35)))
        rows.append(row)
    from lib.geo import grid_surface

    blade += grid_surface(rows, PLASTIC, hard=False)
    g += radial(blade, 7, "z").moved(cx, cy, FAN_Z - 0.006)
    return g


def expansion(lite: bool) -> Geo:
    x, y, z = TANK
    n = 2 if lite else 4
    g = rounded_box(0.170, 0.120, 0.140, 0.030, LIGHT, center=(x, y, z), n=n)
    g += rounded_box(0.120, 0.030, 0.090, 0.012, LIGHT, center=(x + 0.010, y + 0.072, z + 0.010), n=n)
    if not lite:
        for k in (-1, 1):
            g += box(0.090, 0.003, 0.004, PLASTIC, center=(x + 0.030, y + k * 0.022, z + 0.071))
    # čep i dva nastavka creva
    g += lathe([(0.0, 0.0), (0.030, 0.0), (0.032, 0.010), (0.030, 0.022), (0.0, 0.024)], 24 if not lite else 12, PLASTIC, hard=False).moved(x + 0.030, y + 0.086, z + 0.020)
    g += cylinder(0.010, 0.040, 10, LIGHT, axis="x", center=False).moved(x + 0.085, y - 0.030, z + 0.040)
    return g


def hoses(lite: bool) -> Geo:
    g = Geo()
    sides = 10 if lite else 16
    rx = RAD_W / 2 + 0.026
    cy, cz = RAD[1], RAD[2] - 0.072
    # gornje crevo: termostat -> desni rezervoar hladnjaka (ispod prelazne usisne cevi)
    g += hose([V(THERMO), V((-0.100, 0.694, 1.734)), V((-0.180, 0.650, 1.800)), V((-0.250, 0.634, 1.880)), V((-rx, cy + 0.170, cz - 0.060)), V((-rx, cy + 0.170, cz))], 0.022, sides, RUBBER, cuffs=True)
    # donje crevo: desni rezervoar dole -> bočni usis pumpe vode
    g += hose([V((-rx, cy - 0.185, cz)), V((-0.300, 0.300, 1.900)), V((-0.160, 0.362, 1.830)), V((-0.205, 0.520, 1.735)), V((-0.225, 0.585, 1.680)), V(PUMP_IN)], 0.022, sides, RUBBER, cuffs=True)
    # posuda: odzračivanje hladnjaka i povrat ka motoru
    tx, ty, tz = TANK
    # napojno crevo posude ide spolja i ispod cevi punjenja do donjeg creva (T-spoj)
    g += hose([V((tx + 0.020, ty - 0.060, tz + 0.040)), V((tx + 0.020, 0.450, tz + 0.050)), V((-0.520, 0.272, tz + 0.070)), V((-0.400, 0.258, tz + 0.080)), V((-0.322, 0.292, tz + 0.080))], 0.009, 8, RUBBER)
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    ctx.add_part("hladnjak", "", radiator(lite))
    ctx.add_part("interkuler", "", intercooler(lite))
    ctx.add_part("ventilator", "", fan(lite))
    ctx.add_part("ekspanziona_posuda", "", expansion(lite))
    ctx.add_part("creva_hladjenja", "", hoses(lite))
    _ = (T, sweep, catmull)
