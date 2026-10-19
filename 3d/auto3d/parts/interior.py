"""Enterijer (A08). Vozač je levo (+x).

Sedišta su loftovi preseka: jastuk duž z (presek preko širine: bočni oslonci, srednji umetak,
žlebovi šavova), naslon duž visine (oslonci napred), poprečni šavovi su urezi u stanicama. Naslon za
glavu na dve šipke, zadnja školjka, podnožje sa šinama i prekidačima. Klupa ima dva oblikovana
spoljna mesta i uže srednje, tri naslona za glavu. Tabla je loft preko širine: gornji jastuk,
lice sa ventilacionom trakom, prostor za kolena; dva ekrana (12,3" i 14,9") u jednom zakrivljenom
kućištu. Volan sa tri kraka, jastukom i ručicama menjača. Konzola sa ručicom menjača, točkićem,
držačima čaša i naslonom za ruku. Pedale: gas (zglob na podu), kočnica, oslonac za levu nogu.
"""

from __future__ import annotations

import math

from mathutils import Matrix, Vector

from config import hardpoints as H
from lib.geo import Geo, R, T, box, catmull, cylinder, lathe, rounded_box, rounded_rect, tube, extrude
from lib.shapes import along

LEATHER = "mat_leather"
PLASTIC = "mat_plastic"
ALU = "mat_alu"
SCREEN = "mat_screen"
RUBBER = "mat_rubber"

V = Vector
SEAT_X = 0.400
FLOOR_Y = H.FLOOR_Y + 0.001  # gornja strana prednjeg poda
REAR_PAN_Y = H.REAR_PAN_Y + 0.001  # gornja strana poda ispod klupe
WHEEL_C = V((0.370, 0.880, 0.240))
WHEEL_TILT = 25.0


def grid_loft(rows, mats_fn=None, mat: str = LEATHER, closed: bool = True, cap: bool = True, cap_mat: str | None = None) -> Geo:
    """Površina kroz redove tačaka (svaki red je zatvoren presek); materijal po koloni."""
    g = Geo()
    idx = [[g.v(p) for p in row] for row in rows]
    m = len(idx[0])
    cols = m if closed else m - 1
    for i in range(len(idx) - 1):
        for j in range(cols):
            j1 = (j + 1) % m
            g.f((idx[i][j], idx[i][j1], idx[i + 1][j1], idx[i + 1][j]), mats_fn(j) if mats_fn else mat, None, False)
    if cap and closed:
        for ring, rev in ((idx[0], True), (idx[-1], False)):
            c = g.v(sum((g.verts[k] for k in ring), Vector()) / m)
            for j in range(m):
                j1 = (j + 1) % m
                g.f((c, ring[j1], ring[j]) if rev else (c, ring[j], ring[j1]), cap_mat or (mats_fn(0) if mats_fn else mat), None, False)
    return g


def smooth_profile(pts, n: int = 2):
    """Chaikin zaobljavanje otvorenog profila (krajevi ostaju)."""
    P = [V(p) for p in pts]
    for _ in range(n):
        out = [P[0]]
        for i in range(len(P) - 1):
            a, b = P[i], P[i + 1]
            out += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        out.append(P[-1])
        P = out
    return P


def tilt_x(g: Geo, pivot, deg: float) -> Geo:
    """Nagib oko ose x kroz pivot (pozitivno = vrh ka nazad, -z)."""
    px, py, pz = pivot
    return g.transform(T(px, py, pz) @ R("x", -deg) @ T(-px, -py, -pz))


# --------------------------------------------------------------------------- prednje sedište


def _cushion_profile(w: float, groove: float, lite: bool):
    """Gornji presek jastuka preko širine (x od -w/2 do w/2), visina iznad baze; zatvoren dnom."""
    h = w / 2
    top = [(-h, 0.000), (-h + 0.004, 0.070), (-h + 0.030, 0.118), (-h + 0.060, 0.120), (-h + 0.092, 0.092),
           (-h + 0.100 - 0.004, 0.080), (-h + 0.100, 0.080 - groove), (-h + 0.104, 0.074), (-0.06, 0.070), (0.06, 0.070),
           (h - 0.104, 0.074), (h - 0.100, 0.080 - groove), (h - 0.100 + 0.004, 0.080), (h - 0.092, 0.092), (h - 0.060, 0.120),
           (h - 0.030, 0.118), (h - 0.004, 0.070), (h, 0.000)]
    if lite:
        top = [top[0], top[2], top[4], top[7], top[8], top[9], top[10], top[13], top[15], top[17]]
    return top


def front_seat(xc: float, lite: bool) -> Geo:
    g = Geo()
    w = 0.500
    base_y = 0.355
    za, zb = -0.505, 0.015  # zadnja ivica jastuka (uz naslon) .. prednja ivica
    prof = _cushion_profile(w, 0.006, lite)
    n_st = 10 if lite else 22
    rows = []
    for k in range(n_st + 1):
        t = k / n_st
        z = za + (zb - za) * t
        # prednja ivica se zaobljava naniže, oslonac za butine je blago viši
        lift = 0.018 * math.sin(math.pi * min(1.0, t / 0.85)) + 0.012 * t
        drop = max(0.0, (t - 0.88) / 0.12)
        sc = 1.0 - 0.55 * drop ** 2
        seam = -0.005 if (not lite and any(abs(t - q) < 0.012 for q in (0.30, 0.52, 0.74))) else 0.0
        row = []
        for x, y in prof:
            yy = y * sc + lift * (1 if y > 0.01 else 0)
            if seam and abs(x) < w / 2 - 0.104:
                yy += seam
            row.append(V((xc + x * (1.0 - 0.06 * t), base_y + yy, z)))
        row += [V((xc + w / 2 - 0.01, base_y - 0.030, z)), V((xc - w / 2 + 0.01, base_y - 0.030, z))]
        rows.append(row)
    g += grid_loft(rows)
    # naslon: presek preko širine u ravni x-z (oslonci napred), loft po visini, nagib 22°
    hb = 0.640
    bprof = [(-0.25, 0.000), (-0.245, 0.060), (-0.218, 0.110), (-0.190, 0.118), (-0.165, 0.080), (-0.148, 0.066), (-0.144, 0.060), (-0.138, 0.064),
             (0.0, 0.058), (0.138, 0.064), (0.144, 0.060), (0.148, 0.066), (0.165, 0.080), (0.190, 0.118), (0.218, 0.110), (0.245, 0.060), (0.25, 0.000)]
    if lite:
        bprof = [bprof[i] for i in (0, 2, 3, 5, 8, 11, 13, 14, 16)]
    rows = []
    nb = 10 if lite else 24
    zb0 = za - 0.035
    for k in range(nb + 1):
        t = k / nb
        y = base_y + 0.050 + hb * t
        wk = 1.0 - 0.08 * math.sin(math.pi * t * 0.9) + 0.03 * t  # struk u lumbalnom delu, šira ramena
        bol = 1.0 - 0.45 * max(0.0, (t - 0.80) / 0.20)  # oslonci se smiruju ka vrhu
        lumbar = 0.020 * math.exp(-((t - 0.28) / 0.14) ** 2)
        seam = -0.005 if (not lite and any(abs(t - q) < 0.010 for q in (0.22, 0.40, 0.58, 0.76))) else 0.0
        row = []
        for x, d in bprof:
            dd = d * (bol if abs(x) > 0.15 else 1.0) + (lumbar if abs(x) < 0.15 else 0.0)
            if seam and abs(x) < 0.14:
                dd += seam
            row.append(V((xc + x * wk, y, zb0 + dd)))
        # zadnja školjka naslona: ispupčena, sa ivicom (ne ravna ploča)
        row += [V((xc + u * 0.24 * wk, y, zb0 - 0.042 - 0.028 * (1.0 - u * u) * math.sin(math.pi * min(1.0, max(0.0, (t - 0.18) / 0.82))))) for u in (1.0, 0.66, 0.33, 0.0, -0.33, -0.66, -1.0)]
        rows.append(row)
    back = grid_loft(rows, mats_fn=lambda j: LEATHER if j < len(bprof) - 1 else PLASTIC)
    # naslon za glavu na dve šipke
    hr = rounded_box(0.270, 0.170, 0.090, 0.040, LEATHER, center=(xc, base_y + 0.050 + hb + 0.130, zb0 + 0.010), n=2 if lite else 4)
    for dx in (-0.070, 0.070):
        hr += cylinder(0.006, 0.090, 8, PLASTIC, axis="y", center=False).moved(xc + dx, base_y + 0.050 + hb - 0.010, zb0 + 0.000)
    back += hr
    g += tilt_x(back, (xc, base_y + 0.030, zb0), 22.0)
    # podnožje: obloga sa prekidačima (spolja), šine na podu
    g += rounded_box(w - 0.040, 0.080, 0.500, 0.020, PLASTIC, center=(xc, base_y - 0.050, (za + zb) / 2 - 0.010), n=2 if lite else 3)
    sx = 1 if xc > 0 else -1
    g += rounded_box(0.012, 0.050, 0.180, 0.010, PLASTIC, center=(xc + sx * (w / 2 - 0.004), base_y - 0.030, -0.165))
    if not lite:
        g += rounded_box(0.010, 0.014, 0.060, 0.006, PLASTIC, center=(xc + sx * (w / 2 + 0.004), base_y - 0.020, -0.135))
        g += rounded_box(0.010, 0.030, 0.014, 0.006, PLASTIC, center=(xc + sx * (w / 2 + 0.004), base_y - 0.010, -0.215))
    for dx in (-0.160, 0.160):
        g += box(0.036, 0.024, 0.600, PLASTIC, center=(xc + dx, FLOOR_Y + 0.013, -0.250))
    return g


# --------------------------------------------------------------------------- zadnja klupa


def bench(lite: bool) -> Geo:
    g = Geo()
    hw = 0.655
    base_y = REAR_PAN_Y + 0.040
    za, zb = -1.230, -0.715
    # presek preko širine: spoljni oslonac, spoljno mesto, šav, srednje mesto (uže, više)
    half = [(-hw, 0.000), (-hw + 0.010, 0.070), (-hw + 0.040, 0.105), (-hw + 0.080, 0.100), (-0.560, 0.086), (-0.556, 0.080), (-0.552, 0.086),
            (-0.380, 0.078), (-0.210, 0.086), (-0.206, 0.080), (-0.200, 0.092), (-0.150, 0.096)]
    prof = half + [(0.0, 0.092)] + [(-x, y) for x, y in reversed(half)]
    if lite:
        prof = [prof[i] for i in range(0, len(prof), 2)] + ([prof[-1]] if (len(prof) - 1) % 2 else [])
    n_st = 8 if lite else 18
    rows = []
    for k in range(n_st + 1):
        t = k / n_st
        z = za + (zb - za) * t
        drop = max(0.0, (t - 0.86) / 0.14)
        sc = 1.0 - 0.6 * drop ** 2
        seam = -0.005 if (not lite and any(abs(t - q) < 0.016 for q in (0.35, 0.62))) else 0.0
        row = [V((x, base_y + y * sc + 0.012 * t + (seam if abs(abs(x) - 0.38) < 0.16 else 0.0) * (1 if y > 0.01 else 0), z)) for x, y in prof]
        row += [V((hw - 0.01, base_y - 0.025, z)), V((-hw + 0.01, base_y - 0.025, z))]
        rows.append(row)
    g += grid_loft(rows)
    g += rounded_box(2 * hw - 0.040, base_y - REAR_PAN_Y - 0.004, zb - za - 0.040, 0.010, PLASTIC,
                     center=(0.0, (base_y + REAR_PAN_Y) / 2 + 0.002, (za + zb) / 2), n=2)
    # naslon (loft po visini), nagib 25°, sa srednjim naslonom za ruku (urezan šav)
    hb = 0.545
    narrow = 0.07  # naslon se sužava ka vrhu (C-stubovi pri rasklapanju)
    bhalf = [(-hw, 0.000), (-hw + 0.012, 0.060), (-hw + 0.050, 0.095), (-0.555, 0.080), (-0.550, 0.072), (-0.545, 0.080), (-0.380, 0.070),
             (-0.205, 0.080), (-0.200, 0.072), (-0.195, 0.080)]
    bprof = bhalf + [(0.0, 0.080)] + [(-x, y) for x, y in reversed(bhalf)]
    if lite:
        bprof = [bprof[i] for i in range(0, len(bprof), 2)] + ([bprof[-1]] if (len(bprof) - 1) % 2 else [])
    nb = 8 if lite else 18
    zb0 = za - 0.020
    rows = []
    for k in range(nb + 1):
        t = k / nb
        y = base_y + 0.050 + hb * t
        bol = 1.0 - 0.5 * max(0.0, (t - 0.8) / 0.2)
        k = 1.0 - narrow * t
        rear = [V((u * (hw - 0.01) * k, y, zb0 - 0.045 - 0.022 * (1.0 - u * u))) for u in (1.0, 0.6, 0.2, -0.2, -0.6, -1.0)]
        rows.append([V((x * k, y, zb0 + d * (bol if abs(x) > 0.5 else 1.0))) for x, d in bprof] + rear)
    back = grid_loft(rows, mats_fn=lambda j: LEATHER if j < len(bprof) - 1 else PLASTIC)
    for x, w in ((-0.380, 0.250), (0.0, 0.190), (0.380, 0.250)):
        back += rounded_box(w, 0.130, 0.080, 0.035, LEATHER, center=(x, base_y + 0.050 + hb + 0.080, zb0 + 0.020), n=2 if lite else 4)
        for dx in (-0.055, 0.055):
            back += cylinder(0.005, 0.040, 8, PLASTIC, axis="y", center=False).moved(x + dx * w / 0.25, base_y + 0.050 + hb - 0.010, zb0 + 0.015)
    g += tilt_x(back, (0.0, base_y + 0.030, zb0), 25.0)
    return g


# --------------------------------------------------------------------------- tabla


def _dash_section(x: float):
    """Presek table (z, y) za dati x: od dna vetrobrana preko gornjeg jastuka, lica, kolena do dna."""
    ax = abs(x)
    driver = math.exp(-((x - 0.37) / 0.22) ** 2)  # štitnik instrumenata ispred vozača
    center = math.exp(-(x / 0.16) ** 2)  # centralni deo (konzola ispod)
    end = max(0.0, (ax - 0.54) / 0.12)  # krajevi se sužavaju ka vratima (uže od razmaka A-stubova)
    top_y = 0.928 + 0.012 * driver - 0.030 * end
    face_z = 0.300 - 0.020 * center + 0.060 * end
    knee_z = 0.420 - 0.050 * center + 0.040 * end
    stack = math.exp(-(x / 0.30) ** 4)  # središnji deo iznad tunela
    knee_y = 0.560 + 0.050 * center + 0.100 * stack
    return [(0.528 - 0.040 * end, 0.950 - 0.012 * end), (0.470 - 0.020 * end, top_y + 0.008), (0.380, top_y), (face_z + 0.035, top_y - 0.012), (face_z, top_y - 0.050),
            (face_z - 0.004, 0.840), (face_z + 0.006, 0.790), (face_z + 0.030, 0.740), (knee_z, 0.650), (knee_z + 0.030, knee_y), (0.440, 0.700),
            (0.482, 0.800), (0.516, 0.900)]  # donja strana se penje ka vetrobranu (do z 0,53, ispod lima ispred stakla)


def dashboard(lite: bool) -> Geo:
    g = Geo()
    xs = [-0.640 + 1.28 * i / (14 if lite else 36) for i in range((14 if lite else 36) + 1)]
    rows = []
    for x in xs:
        sec = _dash_section(x)
        rows.append([V((x, y, z)) for z, y in sec])
    n = len(rows[0])
    # gornji jastuk u koži, ostalo plastika
    g += grid_loft(rows, mats_fn=lambda j: LEATHER if j <= 3 or j == 8 else PLASTIC, closed=True, cap=True, cap_mat=PLASTIC)  # gornji jastuk i jastuk za kolena u koži
    # ventilaciona traka preko lica (urezani otvori sa lamelama), centralni i bočni otvori
    vy = 0.812
    for x0, x1 in ((-0.63, -0.45), (-0.20, 0.20), (0.45, 0.63)):
        sec_z = _dash_section((x0 + x1) / 2)[5][0]
        g += box(x1 - x0, 0.040, 0.010, PLASTIC, center=((x0 + x1) / 2, vy, sec_z - 0.006))
        if not lite:
            for k in range(4):
                g += box(x1 - x0 - 0.010, 0.003, 0.012, PLASTIC, center=((x0 + x1) / 2, vy - 0.014 + 0.009 * k, sec_z - 0.010))
    # dva ekrana: instrumenti 12,3" iza gornjeg dela volana i centralni 14,9", oba na vrhu table
    for xc, yc, zc, w, h, tilt in ((0.370, 0.928, 0.392, 0.292, 0.112, 22.0), (0.010, 0.942, 0.332, 0.330, 0.186, 18.0)):
        scr = rounded_box(w + 0.020, 0.014, h + 0.020, 0.012, PLASTIC, center=(0.0, 0.0, 0.0), n=2 if lite else 3)
        scr += box(w, 0.002, h, SCREEN, center=(0.0, -0.008, 0.0))
        scr.transform(R("x", 90))  # ravan x-y, lice ka -z
        scr.transform(R("x", -tilt))
        g += scr.moved(xc, yc, zc)
    # ručica svetala, kontrole klime ispod ekrana, kutija za rukavice (urez), prekidač starta
    g += rounded_box(0.240, 0.050, 0.014, 0.010, PLASTIC, center=(0.010, 0.735, _dash_section(0.0)[7][0] - 0.010))
    if not lite:
        for k in range(5):
            g += rounded_box(0.034, 0.016, 0.012, 0.005, PLASTIC, center=(-0.080 + 0.040 * k, 0.735, _dash_section(0.0)[7][0] - 0.020))
    gz = _dash_section(-0.45)[8][0]
    g += box(0.330, 0.004, 0.006, PLASTIC, center=(-0.450, 0.700, gz - 0.006))
    g += box(0.330, 0.004, 0.006, PLASTIC, center=(-0.450, 0.600, gz + 0.020))
    _ = n
    return g


# --------------------------------------------------------------------------- volan


def steering_wheel(lite: bool) -> Geo:
    g = Geo()
    n = 28 if lite else 64
    R0 = 0.185
    rim = []
    for i in range(n):
        a = 2 * math.pi * i / n
        rim.append(V((R0 * math.cos(a), R0 * math.sin(a), 0.0)))
    # deblji obod na mestima za palčeve (na 3 i 9 sati)
    from lib.geo import sweep

    prof = [(0.018 * math.cos(2 * math.pi * k / (8 if lite else 14)), 0.014 * math.sin(2 * math.pi * k / (8 if lite else 14))) for k in range(8 if lite else 14)]
    sc = [1.0 + 0.18 * (math.exp(-((math.cos(2 * math.pi * i / n)) ** 2 - 1) ** 2 * 40)) for i in range(n)]
    w = sweep(rim, prof, LEATHER, closed_path=True, caps=False, hard=False, scales=sc, up_hint=(0, 0, 1))
    # tri kraka (levo, desno, dole) sa obradom i dugmićima, jastuk vazdušnog jastuka
    for a, wd in ((0.0, 0.050), (180.0, 0.050), (270.0, 0.040)):
        r = math.radians(a)
        p0 = V((0.055 * math.cos(r), 0.055 * math.sin(r), -0.012))
        p1 = V((0.172 * math.cos(r), 0.172 * math.sin(r), 0.0))
        from lib.shapes import box_tube

        w += box_tube([p0, p1], 0.014, wd, ALU, r=0.005, up=(0, 0, 1))
        if a != 270.0 and not lite:
            for k in range(3):
                w += rounded_box(0.014, 0.012, 0.006, 0.004, PLASTIC, center=(0.105 * math.cos(r) + (k - 1) * 0.0, 0.105 * math.sin(r) + (k - 1) * 0.016, -0.020))
    w += rounded_box(0.130, 0.110, 0.050, 0.035, LEATHER, center=(0.0, 0.010, -0.025), n=2 if lite else 4)
    # ručice menjača (aluminijum) iza krakova
    for s in (-1, 1):
        w += rounded_box(0.012, 0.070, 0.006, 0.003, ALU, center=(s * 0.150, 0.040, 0.030))
    # stub volana sa oblogom do table
    w += lathe([(0.0, 0.0), (0.040, 0.0), (0.050, 0.030), (0.054, 0.060), (0.0, 0.062)], 16 if lite else 28, PLASTIC, axis="z", hard=False).moved(0.0, 0.0, 0.020)
    # ravan točka: normala ka vozaču (-z), nagib 25° (vrh ka vetrobranu)
    w.transform(R("x", -WHEEL_TILT))
    g += w.moved(*WHEEL_C)
    return g


# --------------------------------------------------------------------------- konzola


def console(lite: bool) -> Geo:
    g = Geo()
    # telo konzole: presek (x, y), loft po z; spušta se ka centralnom delu table
    def sec(z):
        top = 0.700 + 0.030 * max(0.0, min(1.0, (-z - 0.20) / 0.20))  # naslon za ruku je viši
        if z > 0.20:
            top = 0.700 - 0.500 * (z - 0.20)  # spušta se ispod centralnog dela table
        hw = 0.112
        bot = H.tunnel_at(z)[2] + 0.003  # konzola stoji na tunelu
        return [(-hw, bot), (-hw, top - 0.030), (-hw + 0.016, top - 0.004), (hw - 0.016, top - 0.004), (hw, top - 0.030), (hw, bot)]
    rows = []
    zs = [0.330, 0.300, 0.250, 0.200, 0.120, 0.000, -0.050, -0.180, -0.220, -0.400, -0.560, -0.620] if not lite else [0.330, 0.250, 0.120, -0.050, -0.220, -0.620]
    for z in zs:
        rows.append([V((x, y, z)) for x, y in sec(z)])
    g += grid_loft(rows, mat=PLASTIC)
    # naslon za ruku u koži sa šavom, ručica menjača, točkić, držači čaša, punjač
    g += rounded_box(0.210, 0.030, 0.360, 0.014, LEATHER, center=(0.0, 0.742, -0.410), n=2 if lite else 3)
    g += box(0.004, 0.004, 0.340, LEATHER, center=(0.0, 0.758, -0.410))
    g += rounded_box(0.050, 0.070, 0.090, 0.022, LEATHER, center=(0.0, 0.732, 0.120), n=2 if lite else 4)
    g += rounded_box(0.056, 0.012, 0.096, 0.010, ALU, center=(0.0, 0.700, 0.120))
    g += lathe([(0.0, 0.0), (0.030, 0.0), (0.030, 0.020), (0.026, 0.024), (0.0, 0.024)], 16 if lite else 32, ALU, hard=False).moved(0.0, 0.696, -0.010)
    for x in (-0.048, 0.048):
        g += lathe([(0.034, 0.0), (0.038, 0.0), (0.038, 0.004), (0.034, 0.004)], 16 if lite else 28, ALU, hard=False).moved(x, 0.697, -0.120)
        g += cylinder(0.034, 0.004, 16 if lite else 28, PLASTIC, axis="y").moved(x, 0.660, -0.120)
    g += rounded_box(0.150, 0.006, 0.090, 0.010, PLASTIC, center=(0.0, 0.668, 0.255))
    # zadnji otvori ventilacije za putnike pozadi
    for x in (-0.045, 0.045):
        g += box(0.070, 0.040, 0.006, PLASTIC, center=(x, 0.640, -0.623))
    return g


# --------------------------------------------------------------------------- pedale


def pedals(lite: bool) -> Geo:
    g = Geo()
    # kočnica: ruka od zgloba ispod table do širokog jastučića
    piv = V((0.420, 0.600, 0.740))
    pad = V((0.420, 0.380, 0.665))
    from lib.shapes import box_tube

    g += box_tube([piv, piv.lerp(pad, 0.5) + V((0, 0, -0.020)), pad], 0.016, 0.010, ALU, r=0.003, up=(1, 0, 0))
    g += tilt_x(rounded_box(0.100, 0.080, 0.012, 0.010, ALU, center=(pad.x, pad.y, pad.z - 0.004)), (pad.x, pad.y, pad.z), -20.0)
    g += tilt_x(rounded_box(0.090, 0.070, 0.004, 0.008, RUBBER, center=(pad.x, pad.y, pad.z - 0.012)), (pad.x, pad.y, pad.z), -20.0)
    g += box(0.060, 0.050, 0.040, ALU, center=(piv.x, piv.y + 0.010, piv.z + 0.020))
    # gas: stojeća pedala sa zglobom na podu
    acc = V((0.330, FLOOR_Y + 0.012, 0.600))
    g += box(0.050, 0.024, 0.040, RUBBER, center=(acc.x, acc.y, acc.z))
    plate = rounded_box(0.060, 0.220, 0.010, 0.012, ALU, center=(acc.x, acc.y + 0.110, acc.z))
    g += tilt_x(plate, (acc.x, acc.y, acc.z), -38.0)
    # oslonac za levu nogu
    rest = rounded_box(0.080, 0.200, 0.010, 0.010, ALU, center=(0.580, FLOOR_Y + 0.106, 0.640))
    g += tilt_x(rest, (0.580, FLOOR_Y - 0.002, 0.640), -45.0)
    _ = lite
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    ctx.add_part("sediste_prednje", "l", front_seat(SEAT_X, lite))
    ctx.add_part("sediste_prednje", "d", front_seat(-SEAT_X, lite))
    ctx.add_part("zadnja_klupa", "", bench(lite))
    ctx.add_part("tabla", "", dashboard(lite))
    ctx.add_part("volan", "", steering_wheel(lite))
    ctx.add_part("konzola", "", console(lite))
    ctx.add_part("pedale", "", pedals(lite))
    _ = (Matrix, catmull, rounded_rect, tube, extrude, box)
