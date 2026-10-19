"""Motor R6 3,0 l uzdužno (A08): radilica po z na y = 0,40, cilindri od napred (z 1,55) ka nazad.

Usis je levo (+x), izduv desno (-x). Blok i glava su aluminijumski odlivci sa rebrima, čepovima i
prirubnicama; poklopac ventila nosi šest bobina u kanalu; usisna grana ima šest zakrivljenih
kanala do plenuma i telo leptira napred; izduvne grane su dve 3-u-1 grane do dva turbopunjača
sa pužnim kućištima (turbina od liva, kompresor od aluminijuma). Starter-generator 48 V i pumpa
vode su na poli-V kaišu sa zatezačem. Karter ima tunel kroz koji prolazi desna poluosovina
(kao kod pravih AWD limuzina sa uzdužnim motorom).
"""

from __future__ import annotations

import math

from mathutils import Matrix, Vector

from config import dims as D
from lib.geo import Geo, R, belt_path, box, catmull, circle2d, cylinder, extrude, lathe, radial, rounded_box, rounded_rect, superellipse2d, loft, tube
from lib.shapes import along, along_z, belt_mesh, bolt, boss, box_tube, hose, volute_z

ALU = "mat_alu"
CAST = "mat_cast"
STEEL = "mat_steel"
PLASTIC = "mat_plastic"
RUBBER = "mat_rubber"
SHIELD = "mat_heat_shield"

CY = D.CRANK_Y  # 0.40
Z0, Z1 = D.BLOCK_Z  # 0.98 .. 1.62
ZC = (Z0 + Z1) / 2
PITCH = 0.091
CYL_Z = [Z1 - 0.07 - PITCH * i for i in range(6)]  # 1.55 … 1.095
DECK = 0.26  # iznad radilice
HEAD_TOP = 0.375
COVER_TOP = 0.424  # vrh poklopca 0,824 (hauba iznad z 1,6 je 0,857)
PORT_Y = CY + 0.338  # visina usisnih i izduvnih kanala na glavi
PORT_X = 0.122
TURBO = {"p": Vector((-0.392, 0.436, 1.455)), "z": Vector((-0.392, 0.520, 1.140))}  # zadnji je viši: koleno njegovog usisa ide iznad izlaza prednjeg
BELT_Z = 1.685
BELT = [(0.0, CY, 0.090), (0.24, 0.52, 0.036), (0.085, 0.645, 0.034), (-0.12, 0.62, 0.050), (-0.14, 0.445, 0.030)]


def P(pts):
    """(x, y iznad radilice) -> (x, y vozila)."""
    return [(x, CY + y) for x, y in pts]


def mirror_profile(half):
    """Polovina obrisa (x < 0, odozdo nagore) -> ceo zatvoren obris."""
    return list(half) + [(-x, y) for x, y in reversed(half)]


# --------------------------------------------------------------------------- blok


def block(lite: bool) -> Geo:
    g = Geo()
    half = [(-0.116, -0.090), (-0.129, -0.040), (-0.126, 0.030), (-0.101, 0.082), (-0.101, 0.246), (-0.105, 0.248), (-0.105, DECK)]
    g += along_z(P(mirror_profile(half)), Z0 + 0.012, Z1, ALU)
    # zadnja prirubnica za zvono menjača
    fl = [(x, CY + 0.02 + y) for x, y in superellipse2d(0.212, 0.205, 3.2, 40 if not lite else 24)]
    g += along_z(fl, Z0, Z0 + 0.012, ALU)
    # prednji poklopac lanca (blok + glava), sa ležištem semeringa radilice
    front = mirror_profile([(-0.112, -0.086), (-0.128, -0.030), (-0.122, 0.080), (-0.114, 0.300), (-0.106, 0.360), (-0.078, 0.382)])
    g += along_z(P(front), Z1, Z1 + 0.036, ALU)
    g += lathe([(0.0, 0.0), (0.056, 0.0), (0.056, 0.008), (0.040, 0.012), (0.0, 0.012)], 28 if not lite else 16, ALU, axis="z", hard=False).moved(0.0, CY, Z1 + 0.036)
    # kućište termostata (izlaz ka gornjem crevu) iznad ravni kaiša
    g += lathe([(0.0, 0.0), (0.030, 0.0), (0.030, 0.034), (0.024, 0.044), (0.0, 0.046)], 20 if not lite else 12, ALU, axis="z", hard=False).moved(-0.045, 0.745, Z1 + 0.036)
    g += lathe([(0.0, 0.0), (0.023, 0.0), (0.023, 0.030), (0.0, 0.030)], 16 if not lite else 10, ALU, axis="z", hard=False).moved(-0.070, 0.728, Z1 + 0.060)
    # rebra na bočnim licima (između cilindara) i rebra ležajeva radilice na suknji
    edges = [Z1 - 0.07 + PITCH / 2 - PITCH * i for i in range(7)]
    for s in (-1, 1):
        for z in edges[1:-1]:
            g += box(0.010, 0.150, 0.012, ALU, center=(s * 0.106, CY + 0.160, z))
        for z in edges:
            g += box(0.010, 0.050, 0.014, ALU, center=(s * 0.131, CY - 0.010, min(max(z, Z0 + 0.02), Z1 - 0.01)))
        # vodeni kanal uz palubu (horizontalna traka)
        g += box(0.008, 0.016, Z1 - Z0 - 0.04, ALU, center=(s * 0.104, CY + 0.232, ZC))
    if not lite:
        for z in (CYL_Z[1] - PITCH / 2, CYL_Z[3] - PITCH / 2, CYL_Z[4] - PITCH / 2):
            for s in (-1, 1):
                g += boss((s * 0.101, CY + 0.150, z), "x" if s > 0 else "-x", 0.017, 0.004, STEEL)
        # senzor detonacije i davač pritiska ulja (strana usisa)
        g += boss((0.101, CY + 0.120, CYL_Z[2] - 0.045), "x", 0.016, 0.018, ALU)
        g += boss((0.119, CY + 0.120, CYL_Z[2] - 0.045), "x", 0.011, 0.014, STEEL)
        g += bolt((0.126, CY + 0.000, 1.30), "x", STEEL, af=0.017, h=0.008)
    # kućište filtera ulja (usis, pozadi) sa poklopcem uloška
    g += box(0.050, 0.070, 0.090, ALU, center=(0.128, CY + 0.060, 1.075))
    g += lathe([(0.0, 0.0), (0.040, 0.0), (0.040, 0.105), (0.036, 0.115), (0.0, 0.117)], 28 if not lite else 16, ALU, hard=False).moved(0.162, CY + 0.040, 1.075)
    g += bolt((0.162, CY + 0.157, 1.075), "y", ALU, af=0.030, h=0.010)
    # nosači motora (ruke od livenog aluminijuma do gumenih oslonaca na podokviru)
    for s in (-1, 1):
        g += box_tube([Vector((s * 0.122, CY - 0.020, 1.205)), Vector((s * 0.215, CY - 0.050, 1.205)), Vector((s * 0.300, CY - 0.062, 1.205))], 0.050, 0.030, ALU, r=0.008, fillet=0.03)
        g += rounded_box(0.090, 0.012, 0.085, 0.012, ALU, center=(s * 0.300, CY - 0.074, 1.205))
        if not lite:
            g += bolt((s * 0.300, CY - 0.068, 1.205), "y", STEEL, af=0.016, h=0.008)
    if not lite:
        # vijci prednjeg poklopca
        for x, y in ((-0.112, 0.0), (0.112, 0.0), (-0.108, 0.20), (0.108, 0.20), (-0.095, 0.33), (0.095, 0.33)):
            g += bolt((x, CY + y, Z1 + 0.036), "z", STEEL, af=0.010, h=0.005)
    return g


# --------------------------------------------------------------------------- glava


def head(lite: bool) -> Geo:
    g = Geo()
    half = [(-0.108, DECK), (-0.108, 0.300), (-0.122, 0.314), (-0.122, 0.362), (-0.106, HEAD_TOP)]
    g += along_z(P(mirror_profile(half)), Z0 + 0.012, Z1, ALU)
    # prirubnice kanala: usis (+x) i izduv (-x), sa tamnim otvorom i zavrtnjima
    for zc in CYL_Z:
        for s in (1, -1):
            fl = rounded_box(0.010, 0.040, 0.060, 0.010, ALU, center=(s * (PORT_X + 0.005), PORT_Y, zc))
            g += fl
            if not lite:
                for dz in (-0.036, 0.036):
                    g += bolt((s * (PORT_X + 0.010), PORT_Y, zc + dz), "x" if s > 0 else "-x", ALU, af=0.010, h=0.006)
    # uši za podizanje motora (bočno, van poklopca ventila), senzori bregastih (napred)
    g += box(0.010, 0.050, 0.050, ALU, center=(-0.115, CY + HEAD_TOP + 0.010, Z1 - 0.040))
    g += box(0.010, 0.050, 0.050, ALU, center=(0.115, CY + HEAD_TOP + 0.010, Z0 + 0.050))
    if not lite:
        for x in (-0.050, 0.050):
            g += boss((x, CY + 0.330, Z1), "z", 0.012, 0.030, ALU)
        g += boss((0.040, CY + HEAD_TOP - 0.005, Z1 - 0.012), "y", 0.010, 0.020, ALU)
    # zadnji nosač visokopritisne pumpe (strana usisa, iznad bregaste)
    g += rounded_box(0.080, 0.016, 0.070, 0.010, ALU, center=(0.140, CY + 0.352, 1.030))
    return g


# --------------------------------------------------------------------------- poklopac ventila


def cam_cover(lite: bool) -> Geo:
    g = Geo()
    za, zb = Z0 + 0.030, Z1 - 0.018
    # kanal za bobine je udubljenje između dva rebra (vrh rebra = COVER_TOP)
    prof = [(-0.098, HEAD_TOP), (-0.098, 0.398), (-0.090, 0.414), (-0.070, COVER_TOP), (-0.040, COVER_TOP), (-0.034, 0.414),
            (0.034, 0.414), (0.040, COVER_TOP), (0.070, COVER_TOP), (0.090, 0.414), (0.098, 0.398), (0.098, HEAD_TOP)]
    g += along_z(P(prof), za, zb, PLASTIC)
    # prirubnica poklopca
    g += along_z(P([(-0.104, HEAD_TOP), (-0.104, HEAD_TOP + 0.008), (0.104, HEAD_TOP + 0.008), (0.104, HEAD_TOP)]), za - 0.006, zb + 0.004, PLASTIC)
    # šest bobina (oval) sa konektorima i tankim snopom duž kanala
    for zc in CYL_Z:
        g += rounded_box(0.052, 0.008, 0.040, 0.012, PLASTIC, center=(0.0, CY + 0.418, zc))
        g += rounded_box(0.018, 0.010, 0.014, 0.004, ALU, center=(0.0, CY + 0.424, zc + 0.026))
    g += tube([Vector((0.0, CY + 0.422, CYL_Z[-1] - 0.03)), Vector((0.0, CY + 0.422, CYL_Z[0] + 0.05))], 0.0045, 8, PLASTIC)
    # čep za ulje (napred levo), PCV ventil (pozadi desno)
    g += lathe([(0.0, 0.0), (0.026, 0.0), (0.028, 0.006), (0.026, 0.012), (0.0, 0.013)], 24 if not lite else 12, ALU, hard=False).moved(0.066, CY + COVER_TOP - 0.008, 1.47)
    g += rounded_box(0.040, 0.016, 0.050, 0.008, PLASTIC, center=(-0.062, CY + 0.414, 1.07))
    if not lite:
        n = 7
        for k in range(n):
            z = za + 0.02 + (zb - za - 0.04) * k / (n - 1)
            for x in (-0.100, 0.100):
                g += bolt((x, CY + HEAD_TOP + 0.008, z), "y", ALU, af=0.009, h=0.005)
    return g


# --------------------------------------------------------------------------- usisna grana


PLENUM = (0.335, 0.650)


def intake_manifold(lite: bool) -> Geo:
    g = Geo()
    n = 16 if lite else 28
    px, py = PLENUM
    z0, z1 = 1.025, 1.585
    secs = []
    for z, k in ((z0, 0.55), (z0 + 0.025, 0.92), (z0 + 0.06, 1.0), (z1 - 0.04, 1.0), (z1, 0.85)):
        secs.append([(px + x * k, py + y * k, z) for x, y in superellipse2d(0.058, 0.054, 2.4, n)])
    g += loft(secs, PLASTIC, closed=True, caps=True, hard=False)
    # šest kanala: od plenuma gore i unutra do prirubnice glave
    sec = rounded_rect(0.036, 0.044, 0.013, 2 if lite else 3)
    for zc in CYL_Z:
        pts = [Vector((px - 0.025, py + 0.040, zc)), Vector((0.285, 0.735, zc)), Vector((0.225, 0.776, zc)), Vector((0.168, 0.758, zc)), Vector((PORT_X + 0.012, PORT_Y, zc))]
        path = catmull(pts, 3 if lite else 5)
        from lib.geo import sweep

        g += sweep(path, sec, PLASTIC, hard=False, up_hint=(0, 0, 1))
    # zajednička prirubnica uz glavu i rebra za ukrućenje
    g += box(0.012, 0.050, z1 - z0 + 0.03, PLASTIC, center=(PORT_X + 0.016, PORT_Y, (z0 + z1) / 2))
    if not lite:
        for zc in CYL_Z[:-1]:
            g += box(0.006, 0.040, 0.004, PLASTIC, center=(0.300, 0.712, zc - PITCH / 2))
    # telo leptira gasa (napred) sa motorom
    g += lathe([(0.026, 0.0), (0.044, 0.0), (0.044, 0.050), (0.040, 0.056), (0.030, 0.056)], n, ALU, axis="z", hard=False).moved(px, py, z1 - 0.004)
    g += rounded_box(0.040, 0.050, 0.040, 0.010, ALU, center=(px + 0.060, py - 0.020, z1 + 0.026))
    g += lathe([(0.0, 0.0), (0.050, 0.0), (0.050, 0.008), (0.0, 0.008)], n, ALU, axis="z", hard=False).moved(px, py, z1 - 0.008)
    return g


# --------------------------------------------------------------------------- izduvne grane


def _turbine_inlet(t: Vector) -> Vector:
    return Vector((t.x + 0.030, t.y + 0.098, t.z - 0.048))


def exhaust_manifold(lite: bool) -> Geo:
    g = Geo()
    sides = 10 if lite else 16
    for group, key in ((CYL_Z[:3], "p"), (CYL_Z[3:], "z")):
        t = TURBO[key]
        inlet = _turbine_inlet(t)
        coll = inlet + Vector((0.0, 0.032, 0.0))
        for k, zc in enumerate(group):
            # izlaz iz kanala vodoravno, pa luk naniže i ka sabirniku (sve tri cevi iste dužine)
            mid = (zc + coll.z) / 2
            pts = [Vector((-PORT_X - 0.022, PORT_Y, zc)), Vector((-0.172, PORT_Y + 0.004, zc)), Vector((-0.225, PORT_Y - 0.012, zc * 0.8 + coll.z * 0.2)),
                   Vector((-0.262, PORT_Y - 0.050, mid)), Vector((coll.x + 0.012, coll.y + 0.030, coll.z * 0.8 + zc * 0.2)), coll]
            g += tube(catmull(pts, 4 if lite else 6), 0.019, sides, CAST, hard=False)
        # sabirnik (3-u-1) i prirubnica ka turbini
        g += lathe([(0.0, 0.0), (0.036, 0.0), (0.038, 0.024), (0.031, 0.044), (0.0, 0.046)], sides + 4, CAST, axis="-y", hard=False).moved(coll.x, coll.y + 0.026, coll.z)
        g += rounded_box(0.072, 0.012, 0.072, 0.012, CAST, center=(inlet.x, inlet.y + 0.006, inlet.z))
        # štit od lima iznad kućišta turbine (polovina školjke)
        shell = lathe([(0.088, -0.034), (0.092, -0.030), (0.092, 0.030), (0.088, 0.034)], 16 if lite else 28, SHIELD, axis="z", hard=False, angle=150.0, phase=10.0)
        g += shell.moved(t.x, t.y, t.z - 0.048)
    # zajednička prirubnica na glavi
    g += box(0.012, 0.052, Z1 - Z0 - 0.02, CAST, center=(-PORT_X - 0.023, PORT_Y, ZC))  # van zavrtnjeva glave (glava se pri rasklapanju diže pored nje)
    return g


# --------------------------------------------------------------------------- turbopunjač


def turbo(c: Vector, lite: bool) -> Geo:
    """Osa po z; turbina pozadi (liv), kompresor napred (aluminijum), centralni deo od čelika."""
    g = Geo()
    sides = 12 if lite else 18
    steps = 16 if lite else 30
    seg = 20 if lite else 36
    zt, zk = c.z - 0.048, c.z + 0.050
    # turbina: puž + kućište + izlaz (aksijalno ka nazad) sa V-obujmicom
    # ulaz puža turbine je sa strane bloka i gleda gore (ka sabirniku grane)
    g += volute_z(c.x, c.y, zt, 0.048, 0.060, 0.013, 0.028, CAST, sides, steps, start_deg=-310.0, turn=310.0, outlet_len=0.040, sign=1.0)
    g += lathe([(0.0, -0.026), (0.046, -0.026), (0.050, -0.016), (0.050, 0.024), (0.0, 0.026)], seg, CAST, axis="z", hard=False).moved(c.x, c.y, zt)
    g += lathe([(0.030, 0.0), (0.034, 0.0), (0.034, 0.040), (0.030, 0.040)], seg, CAST, axis="-z", hard=False).moved(c.x, c.y, zt - 0.024)
    g += lathe([(0.032, 0.0), (0.045, 0.0), (0.045, 0.012), (0.032, 0.012), (0.032, 0.0)], seg, STEEL, axis="-z", hard=False).moved(c.x, c.y, zt - 0.062)
    # ulaz turbine (ka gornjoj grani): kratak vrat sa prirubnicom
    inlet = _turbine_inlet(c)
    g += tube(catmull([Vector((c.x + 0.060, c.y + 0.038, zt)), Vector((c.x + 0.050, c.y + 0.066, zt - 0.020)), inlet - Vector((0, 0.010, 0))], 4), 0.026, sides, CAST, hard=False)
    # centralni deo (CHRA), vodovi ulja
    g += lathe([(0.0, -0.022), (0.032, -0.022), (0.036, -0.010), (0.036, 0.010), (0.032, 0.022), (0.0, 0.022)], seg, STEEL, axis="z", hard=False).moved(c.x, c.y, c.z)
    g += hose([Vector((c.x, c.y + 0.034, c.z)), Vector((c.x + 0.01, c.y + 0.07, c.z + 0.01)), Vector((c.x + 0.06, c.y + 0.12, c.z + 0.02)), Vector((c.x + 0.16, c.y + 0.14, c.z + 0.02))], 0.004, 6, STEEL)
    g += hose([Vector((c.x, c.y - 0.034, c.z)), Vector((c.x + 0.02, c.y - 0.07, c.z + 0.005)), Vector((c.x + 0.08, c.y - 0.11, c.z + 0.01))], 0.008, 8, STEEL)
    # kompresor: puž + kućište + aksijalni ulaz (napred) sa ivicom, vidljivo kolo
    # izlaz kompresora je na vrhu i gleda ka bloku (+x), pa se cev punjenja odvaja duž ose izlaza
    g += volute_z(c.x, c.y, zk, 0.046, 0.058, 0.012, 0.026, ALU, sides, steps, start_deg=390.0, turn=300.0, outlet_len=0.050, sign=-1.0)
    g += lathe([(0.0, -0.026), (0.052, -0.026), (0.056, -0.016), (0.056, 0.020), (0.034, 0.028), (0.0, 0.028)], seg, ALU, axis="z", hard=False).moved(c.x, c.y, zk)
    g += lathe([(0.028, 0.0), (0.035, 0.0), (0.035, 0.040), (0.039, 0.046), (0.035, 0.052), (0.028, 0.052), (0.028, 0.0)], seg, ALU, axis="z", hard=False).moved(c.x, c.y, zk + 0.026)
    if not lite:
        g += lathe([(0.0, 0.0), (0.016, 0.0), (0.009, 0.024), (0.004, 0.034), (0.0, 0.035)], 16, STEEL, axis="z", hard=False).moved(c.x, c.y, zk + 0.024)
        blade = box(0.0012, 0.024, 0.028, STEEL, center=(0.0, 0.015, 0.014), hard=False)
        blade.transform(R("y", 16))
        g += radial(blade, 7, "z").moved(c.x, c.y, zk + 0.026)
    # električni aktuator wastegate ventila na kompresoru, šipka do poluge na turbini
    g += rounded_box(0.050, 0.040, 0.060, 0.010, ALU, center=(c.x - 0.006, c.y - 0.080, zk - 0.004))
    g += along(cylinder(0.003, 0.090, 8, STEEL, center=False), Vector((c.x - 0.010, c.y - 0.074, zk - 0.03)), Vector((c.x - 0.020, c.y - 0.052, zt - 0.02)))
    return g


# --------------------------------------------------------------------------- starter-generator 48 V


def bsg(lite: bool) -> Geo:
    g = Geo()
    seg = 20 if lite else 36
    x, y = BELT[1][0], BELT[1][1]
    za, zb = 1.405, 1.625
    g += lathe([(0.0, 0.0), (0.060, 0.0), (0.071, 0.012), (0.072, 0.040), (0.072, zb - za - 0.040), (0.066, zb - za - 0.010), (0.040, zb - za), (0.0, zb - za)],
               seg, ALU, axis="z", hard=False).moved(x, y, za)
    if not lite:
        fin = box(0.006, 0.012, zb - za - 0.08, ALU, center=(0.074, 0.0, (zb - za) / 2), hard=False)
        g += radial(fin, 16, "z").moved(x, y, za)
    g += cylinder(0.014, 0.060, 16, STEEL, axis="z", center=False).moved(x, y, zb - 0.002)
    # priključak 48 V i debeli kabl, nosači ka bloku
    g += rounded_box(0.040, 0.036, 0.050, 0.008, PLASTIC, center=(x + 0.070, y + 0.030, za + 0.060))
    g += hose([Vector((x + 0.080, y + 0.040, za + 0.040)), Vector((x + 0.10, y + 0.02, za - 0.04)), Vector((x + 0.10, y - 0.04, za - 0.12))], 0.010, 8, PLASTIC)
    for zz in (za + 0.03, zb - 0.03):
        g += box_tube([Vector((x - 0.060, y - 0.010, zz)), Vector((0.115, CY + 0.070, zz))], 0.030, 0.018, ALU, r=0.006)
    return g


# --------------------------------------------------------------------------- karter


def sump(lite: bool) -> Geo:
    g = Geo()
    top = CY - 0.090  # 0.31
    # gornji deo (šina) duž celog bloka
    g += along_z([(-0.118, top - 0.012), (0.118, top - 0.012), (0.118, top + 0.002), (-0.118, top + 0.002)], Z0 + 0.016, Z1 - 0.006, ALU)
    # duboki deo iza osovine
    deep = [(-0.110, top), (-0.112, 0.255), (-0.100, 0.228), (-0.075, 0.218), (0.075, 0.218), (0.100, 0.228), (0.112, 0.255), (0.110, top)]
    g += along_z(deep, Z0 + 0.030, 1.345, ALU, hard=False)
    # plitki deo iznad osovine sa tunelom kroz koji prolazi desna poluosovina (kao kod pravih AWD
    # motora): obris (z, y) izvučen po x, sa rupom
    seg = 18 if lite else 32
    zf, yf = D.Z_AXLE_F, D.FRONT_DIFF_Y
    outline = [(1.345, top), (1.345, 0.278), (1.420, 0.278), (1.440, 0.222), (1.540, 0.222), (1.560, 0.278), (Z1 - 0.012, 0.278), (Z1 - 0.012, top)]
    hole = [(zf + 0.034 * math.cos(2 * math.pi * i / seg), yf + 0.034 * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    sh = extrude(outline, 0.228, ALU, holes=[hole], hard=True, z0=-0.114)
    g += sh.transform(Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1))))
    for x in (-0.116, 0.116):
        g += lathe([(0.034, -0.004), (0.048, -0.004), (0.048, 0.004), (0.034, 0.004)], seg, ALU, axis="x", hard=False).moved(x, yf, zf)
    # rebra ispod dubokog dela, čep za ispuštanje, senzor nivoa ulja
    for k in range(5):
        z = Z0 + 0.07 + 0.065 * k
        g += box(0.006, 0.016, 0.050, ALU, center=(-0.060, 0.223, z))
        g += box(0.006, 0.016, 0.050, ALU, center=(0.060, 0.223, z))
    g += cylinder(0.012, 0.010, 6, ALU, axis="y").moved(0.0, 0.213, 1.12)
    g += cylinder(0.022, 0.012, 20 if not lite else 12, ALU, axis="y").moved(0.040, 0.212, 1.25)
    return g


# --------------------------------------------------------------------------- kaiš i remenice


def belt(lite: bool) -> Geo:
    g = Geo()
    path = belt_path([(cx, cy, r) for cx, cy, r in BELT])
    g += belt_mesh(path, lambda u, v, w: Vector((u, v, BELT_Z + w)), 0.022, 0.0045, RUBBER, ds=0.012 if lite else 0.006)
    seg = 18 if lite else 36
    for i, (cx, cy, r) in enumerate(BELT):
        rr = r - 0.004
        prof = [(0.0, -0.016), (rr + 0.004, -0.016), (rr + 0.004, -0.012), (rr, -0.011), (rr, 0.011), (rr + 0.004, 0.012), (rr + 0.004, 0.016), (0.0, 0.016)]
        g += lathe(prof, seg, STEEL, axis="z", hard=False).moved(cx, cy, BELT_Z)
        if i == 0:
            # prigušivač vibracija radilice: gumeni prsten i inercioni prsten ispred remenice
            g += lathe([(0.030, 0.0), (0.086, 0.0), (0.086, 0.010), (0.030, 0.010)], seg, RUBBER, axis="z", hard=False).moved(cx, cy, BELT_Z + 0.016)
            g += lathe([(0.0, 0.0), (0.090, 0.0), (0.090, 0.016), (0.040, 0.020), (0.0, 0.022)], seg, STEEL, axis="z", hard=False).moved(cx, cy, BELT_Z + 0.026)
    # pumpa vode iza remenice (na prednjem poklopcu)
    px, py, pr = BELT[3]
    g += lathe([(0.0, 0.0), (0.060, 0.0), (0.064, 0.006), (0.054, 0.011), (0.0, 0.011)], seg, STEEL, axis="-z", hard=False).moved(px, py, BELT_Z - 0.016)  # ispred prednjeg poklopca
    g += lathe([(0.0, 0.0), (0.023, 0.0), (0.023, 0.096), (0.0, 0.096)], 16, STEEL, axis="-x", hard=False).moved(px - 0.020, py - 0.020, BELT_Z - 0.039)
    # automatski zatezač: ruka, opruga u kućištu, osovina
    tx, ty, tr = BELT[2]
    arm = extrude([(-0.012, -0.012), (0.090, -0.020), (0.098, 0.0), (0.090, 0.020), (-0.012, 0.012)], 0.012, STEEL)
    arm.transform(R("z", -40))
    g += arm.moved(tx, ty, BELT_Z - 0.024)
    g += lathe([(0.0, 0.0), (0.032, 0.0), (0.032, 0.026), (0.0, 0.026)], seg, STEEL, axis="-z", hard=False).moved(tx + 0.07, ty - 0.06, BELT_Z - 0.018)
    return g


# --------------------------------------------------------------------------- build


def build(ctx, only=None) -> None:
    lite = ctx.lite
    ctx.add_part("blok_motora", "", block(lite), bevel=0.0 if lite else 0.0025)
    ctx.add_part("glava_motora", "", head(lite), bevel=0.0 if lite else 0.0025)
    ctx.add_part("poklopac_ventila", "", cam_cover(lite), bevel=0.0 if lite else 0.003)
    ctx.add_part("usisna_grana", "", intake_manifold(lite))
    ctx.add_part("izduvna_grana", "", exhaust_manifold(lite))
    ctx.add_part("turbopunjac", "p", turbo(TURBO["p"], lite))
    ctx.add_part("turbopunjac", "z", turbo(TURBO["z"], lite))
    ctx.add_part("starter_generator", "", bsg(lite))
    ctx.add_part("karter", "", sump(lite), bevel=0.0 if lite else 0.003)
    ctx.add_part("remenski_prenos", "", belt(lite))
    _ = (math, circle2d, cylinder, extrude, box_tube)
