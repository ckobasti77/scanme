"""Raspored mehanike i enterijera (A01 §2.5): centar (x, y, z) i veličina (x, y, z) za levu instancu.

Builderi postavljaju delove po ovim tačkama, a proxy pravi kutiju po njima. A08 sme da ih
pomera da reši sudare (upis u ODLUKE).
"""

HARD: dict[str, tuple[tuple[float, float, float], tuple[float, float, float]]] = {
    "retrovizor": ((0.960, 1.035, 0.430), (0.21, 0.13, 0.12)),
    "sediste_prednje": ((0.370, 0.750, -0.270), (0.56, 0.98, 0.72)),
    "zadnja_klupa": ((0.0, 0.680, -1.120), (1.38, 0.86, 0.72)),
    "tabla": ((0.0, 0.800, 0.440), (1.52, 0.36, 0.46)),
    "volan": ((0.370, 0.880, 0.240), (0.37, 0.37, 0.12)),
    "konzola": ((0.0, 0.460, -0.100), (0.26, 0.46, 0.92)),
    "pedale": ((0.360, 0.390, 0.700), (0.26, 0.22, 0.10)),
    "blok_motora": ((0.0, 0.450, 1.300), (0.40, 0.42, 0.64)),
    "glava_motora": ((0.0, 0.720, 1.300), (0.38, 0.12, 0.62)),
    "poklopac_ventila": ((0.0, 0.805, 1.300), (0.30, 0.05, 0.60)),
    "usisna_grana": ((0.300, 0.640, 1.300), (0.24, 0.26, 0.62)),
    "izduvna_grana": ((-0.250, 0.560, 1.300), (0.14, 0.16, 0.60)),
    "turbopunjac": ((-0.390, 0.560, 1.450), (0.24, 0.22, 0.22)),
    "starter_generator": ((0.220, 0.320, 1.520), (0.15, 0.15, 0.22)),
    "karter": ((0.0, 0.300, 1.310), (0.34, 0.22, 0.60)),
    "remenski_prenos": ((0.050, 0.480, 1.680), (0.46, 0.52, 0.05)),
    "filter_vazduha": ((0.430, 0.700, 1.800), (0.30, 0.18, 0.28)),
    "usisne_cevi": ((0.050, 0.550, 1.700), (0.90, 0.55, 0.80)),
    "katalizator": ((-0.330, 0.385, 0.985), (0.26, 0.39, 0.93)),
    "gpf": ((-0.250, 0.200, 0.250), (0.22, 0.13, 0.40)),
    "srednji_lonac": ((0.0, 0.200, -0.300), (0.30, 0.13, 0.50)),
    "zadnji_lonac": ((0.0, 0.290, -2.200), (1.30, 0.20, 0.74)),
    "hladnjak": ((0.0, 0.490, 2.050), (0.72, 0.46, 0.05)),
    "interkuler": ((0.0, 0.300, 2.170), (0.70, 0.20, 0.07)),
    "ventilator": ((0.0, 0.490, 1.970), (0.64, 0.46, 0.10)),
    "ekspanziona_posuda": ((-0.480, 0.720, 1.820), (0.18, 0.14, 0.14)),
    "creva_hladjenja": ((0.0, 0.580, 1.800), (0.70, 0.40, 0.50)),
    "menjac": ((0.0, 0.400, 0.620), (0.44, 0.46, 0.72)),
    "prenosna_kutija": ((0.060, 0.360, 0.160), (0.30, 0.26, 0.20)),
    "kardan_prednji": ((0.240, 0.270, 0.820), (0.07, 0.07, 1.24)),
    "kardan_zadnji": ((0.0, 0.330, -0.640), (0.085, 0.085, 1.48)),
    "diferencijal_prednji": ((0.200, 0.330, 1.490), (0.22, 0.24, 0.26)),
    "diferencijal_zadnji": ((0.0, 0.340, -1.490), (0.34, 0.28, 0.34)),
    "poluosovina_prednja": ((0.520, 0.348, 1.490), (0.50, 0.10, 0.10)),
    "poluosovina_zadnja": ((0.480, 0.344, -1.490), (0.66, 0.10, 0.10)),
    "ramena_prednja": ((0.560, 0.420, 1.490), (0.36, 0.48, 0.42)),
    "ramena_zadnja": ((0.600, 0.380, -1.490), (0.40, 0.40, 0.50)),
    "amortizer_prednji": ((0.600, 0.570, 1.440), (0.16, 0.62, 0.16)),
    "amortizer_zadnji": ((0.600, 0.490, -1.560), (0.18, 0.46, 0.18)),
    "stabilizator_prednji": ((0.0, 0.250, 1.250), (1.20, 0.12, 0.20)),
    "stabilizator_zadnji": ((0.0, 0.290, -1.300), (1.20, 0.12, 0.20)),
    "podokvir_prednji": ((0.0, 0.240, 1.480), (1.00, 0.14, 0.62)),
    "podokvir_zadnji": ((0.0, 0.290, -1.500), (1.10, 0.14, 0.60)),
    "letva_volana": ((0.020, 0.270, 1.640), (1.40, 0.12, 0.14)),
    "kocioni_modul": ((0.420, 0.780, 0.720), (0.26, 0.24, 0.30)),
    "rezervoar": ((0.0, 0.320, -0.850), (1.24, 0.24, 0.60)),
    "pumpa_goriva": ((0.320, 0.330, -0.860), (0.12, 0.20, 0.12)),
    "visokopritisna_pumpa": ((0.200, 0.760, 1.040), (0.09, 0.12, 0.09)),
    "baterija_48v": ((0.400, 0.420, -2.060), (0.30, 0.18, 0.24)),
    "akumulator_12v": ((-0.420, 0.420, -2.060), (0.35, 0.19, 0.18)),
    "far": ((0.600, 0.685, 2.200), (0.52, 0.07, 0.30)),
    "led_traka_prednja": ((0.0, 0.706, 2.300), (1.72, 0.014, 0.20)),
    "stop_svetlo": ((0.740, 0.970, -2.380), (0.40, 0.06, 0.34)),
    "led_traka_zadnja": ((0.0, 0.975, -2.420), (1.80, 0.012, 0.12)),
    "ecu_motora": ((0.560, 0.720, 0.860), (0.22, 0.05, 0.18)),
    "kablovski_snop": ((0.0, 0.600, 0.400), (1.40, 0.60, 3.60)),
}

# A08: pod (deco__karoserija__pod) prati mehaniku. Tunel: (z, pola širine dole, pola širine gore,
# visina spoljnog vrha); spolja je debljina zida 0,02 m. Napred širok (menjač, prenosna kutija,
# prednji kardan), u kabini uzak (kardan i srednji lonac), ispod zadnjeg sedišta ispod poda.
TUNNEL = [
    (0.815, 0.290, 0.215, 0.640),
    (0.600, 0.290, 0.200, 0.625),
    (0.300, 0.300, 0.165, 0.560),
    (0.120, 0.300, 0.150, 0.525),
    (0.050, 0.140, 0.140, 0.445),
    (-0.620, 0.140, 0.140, 0.445),
    (-0.670, 0.120, 0.120, 0.410),  # ispod rezervoara (luk sedla) samo glatko vratilo
    (-1.200, 0.120, 0.120, 0.410),
]
FLOOR_Y = 0.250  # gornja strana prednjeg poda
FLOOR_T = 0.020
KICK_Z = (-0.665, -0.645)  # zid ispod prednje ivice zadnjeg sedišta
REAR_PAN_Y = 0.485  # gornja strana poda ispod zadnjeg sedišta
REAR_PAN_X = 0.700
AXLE_FLOOR = (0.500, 0.440, -1.250, -1.750)  # pod iznad zadnje osovine: donja strana, pola širine, z napred, z pozadi
TRUNK = (0.300, 0.810, -1.900, -2.250)  # pod prtljažnika: donja strana, pola širine, z napred, z pozadi
EXHAUST_CHANNEL = (-0.255, -0.505, 0.100, 0.815, 0.300)  # kanal izduva desno: x unutra, x spolja, z od, z do, visina gornje strane


def tunnel_at(z: float) -> tuple[float, float, float]:
    """(pola širine dole, pola širine gore, visina spoljnog vrha) tunela na datom z."""
    pts = TUNNEL
    if z >= pts[0][0]:
        return pts[0][1:]
    for (z0, *a), (z1, *b) in zip(pts, pts[1:]):
        if z1 <= z <= z0:
            t = (z0 - z) / (z0 - z1)
            return tuple(u + (v - u) * t for u, v in zip(a, b))
    return pts[-1][1:]
