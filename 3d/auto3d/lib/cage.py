"""Parametarski subdivision kavez karoserije (A01 §1.4–1.6).

1. Rešetka: redovi = stanice po z, kolone = ključne linije (config/body.py), leva polovina.
   Prednja i zadnja kapa su Coons zakrpe zavarene za prvi i poslednji red.
2. Atribut lica `panel` (INT) nosi ID panela; Mirror + Subdivision ga prenose na decu-lica.
3. Pečenje, zatim lukovi (brisanje lica u krugu i poravnanje ivice), otvori, stakla.
4. Paneli: izdvajanje po ID-ju, uvlačenje ivice za pola fuge, povratna prirubnica, zaobljen rub.
"""

from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Vector

from config import body as B
from config import dims as D
from . import scene

# ID-jevi panela na licima kaveza
PANELS = [
    "hauba", "blatobran", "vrata_prednja", "vrata_zadnja", "prag", "krov", "krov_staklo", "poklopac_prtljaznika",
    "skelet", "skelet_crno", "branik_prednji", "branik_zadnji", "dlo", "vetrobran", "zadnje_staklo",
    "okvir",  # A07: sjajno crni okvir bočnih stakala (gornja traka i traka četvrtastog stakla, pripada skeletu)
]
PID = {name: i for i, name in enumerate(PANELS)}
SIDE_PANELS = {"blatobran", "vrata_prednja", "vrata_zadnja", "prag", "dlo"}


# --------------------------------------------------------------------------- interpolacija


def _pchip(xs: list[float], ys: list[float]):
    """Monotona kubna Hermite interpolacija (Fritsch–Carlson), bez prebačaja."""
    n = len(xs)
    if n == 1:
        return lambda x: ys[0]
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x: float) -> float:
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = max(0, min(n - 2, next(k for k in range(n - 1) if xs[k + 1] >= x)))
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]

    return f


_LINE_FN: dict[str, tuple] = {}


def _raw(col: str, z: float) -> tuple[float, float]:
    if col not in _LINE_FN:
        pts = sorted(B.LINES[col], key=lambda p: p[0])
        zs = [p[0] for p in pts]
        _LINE_FN[col] = (_pchip(zs, [p[1] for p in pts]), _pchip(zs, [p[2] for p in pts]))
    fx, fy = _LINE_FN[col]
    return (0.0 if col == "ctr" else max(fx(z), 0.0), fy(z))


def line_point(col: str, z: float) -> tuple[float, float]:
    """(x, y) ključne linije `col` na stanici z (izvedene kolone tuck i sh_lo)."""
    if col == "tuck":
        x, y = _raw("bot", z)
        return (x - B.TUCK[0], y + B.TUCK[1])
    if col == "sh_lo":
        sx, sy = _raw("sh", z)
        bx, by = _raw("belly", z)
        d = math.hypot(bx - sx, by - sy) or 1.0
        return (sx + (bx - sx) / d * B.SH_LO, sy + (by - sy) / d * B.SH_LO)
    if col in ("belt_g", "dlo_g"):
        bx, by = _raw("belt", z)
        dx, dy = _raw("dlo", z)
        d = math.hypot(dx - bx, dy - by) or 1.0
        k = min(B.GLASS_SUPPORT, 0.3 * d) / d
        if col == "belt_g":
            return (bx + (dx - bx) * k, by + (dy - by) * k)
        return (dx + (bx - dx) * k, dy + (by - dy) * k)
    return _raw(col, z)


def row_z(row: dict, col: str) -> float:
    if col in row["c"]:
        return row["c"][col]
    g = B.GROUP[col]
    if g == "M":
        return (row["L"] + row["H"]) / 2
    return row[g]


# --------------------------------------------------------------------------- dodela panela


def panel_of(i: int, j: int, zc: float) -> str:
    """Panel lica glavne rešetke: i = red (prednji), j = traka (kolona donje ivice), zc = z sredine trake."""
    R = B.ROW
    if i < R["BFC"]:
        return "branik_prednji" if j <= 6 else "hauba"
    if i < R["FDC"]:
        if j <= 1:
            return "prag" if zc < 1.16 else "blatobran"
        if j <= 6:
            return "blatobran"
        return "hauba" if i < R["HOOD_R"] else "skelet"
    if i < R["WSB"]:
        return "prag" if j <= 1 else ("vrata_prednja" if j <= 6 else "skelet")
    door = "vrata_prednja" if i < R["B"] else "vrata_zadnja"
    roof = "vetrobran" if i < R["WST"] else ("krov" if i < R["RGT"] else "zadnje_staklo")
    if roof == "krov" and j == 12 and R["B1"] <= i < R["PANO_E"]:
        roof = "krov_staklo"
    if i < R["DOG"]:
        if j <= 1:
            return "prag"
        if j <= 6:
            return door
        if j <= 9:
            if R["B1"] <= i < R["B2"]:
                return "skelet_crno"
            # A07: spoljne trake stakla (potporne petlje na 14 mm) su sjajno crni okvir; donja pripada vratima
            if j == 7:
                return door
            return "okvir" if j == 9 else "dlo"
        if j == 10:
            return "skelet" if i < R["WST"] else "skelet_crno"
        return roof
    if i < R["TAIL"]:
        if j <= 1:
            return "prag" if zc > -1.16 else "skelet"
        if j <= 6:
            return "skelet"
        if j <= 9:
            if i < R["DIV2"]:
                return "skelet_crno"
            return "okvir" if j in (7, 9) else "dlo"
        if j == 10:
            return "skelet_crno" if i < R["DIV2"] else "skelet"
        return roof
    if j <= 3:
        return "branik_zadnji" if i >= R["RBC"] else "skelet"
    if j <= 6:
        return "skelet"
    if i < R["RGB"]:
        return "skelet" if j <= 10 else "zadnje_staklo"
    return "poklopac_prtljaznika"


def panel_of_cap(front: bool, a: int, b: int) -> str | None:
    """Panel lica kape: a = traka donjih linija (0 = tuck..bot), b = traka gornjih kolona (0 = sh..belt)."""
    if front:
        if a in B.GRILLE_HOLE["a"] and b in B.GRILLE_HOLE["b"]:
            return None
        return "branik_prednji"
    if a >= 4:
        return "poklopac_prtljaznika" if b >= 1 else "skelet"
    return "branik_zadnji"


# --------------------------------------------------------------------------- kavez


def _bezier(p0, p1, p2, p3, t):
    s = 1 - t
    return tuple(s * s * s * p0[k] + 3 * s * s * t * p1[k] + 3 * s * t * t * p2[k] + t * t * t * p3[k] for k in range(len(p0)))


def _wrap_points(p_row: tuple, p_prev: tuple, center: tuple, fracs: list[float], handle: tuple) -> list[tuple]:
    """Tačke donje linije oko ugla: od tačke reda (x, y, z) do ose (0, yc, zc), po udelima x."""
    x0, y0, z0 = p_row
    yc, zc = center
    dx, dz = x0 - p_prev[0], z0 - p_prev[2]
    dl = math.hypot(dx, dz) or 1.0
    dx, dz = dx / dl, dz / dl
    k, kc = handle
    # ugao kontrolnog poligona: presek tangente linije sa čeonom ravni z = zc
    s_hit = (zc - z0) / dz if abs(dz) > 1e-6 else 0.0
    xc = min(max(x0 + dx * s_hit, 0.05 * x0), x0)
    P0 = (x0, z0)
    P1 = (x0 + (xc - x0) * k, z0 + (zc - z0) * k)
    P2 = (xc * kc, zc)
    P3 = (0.0, zc)
    out = []
    for f in fracs:
        target = x0 * (1 - f)
        lo, hi = 0.0, 1.0
        for _ in range(40):
            mid = (lo + hi) / 2
            if _bezier(P0, P1, P2, P3, mid)[0] > target:
                lo = mid
            else:
                hi = mid
        t = (lo + hi) / 2
        x, z = _bezier(P0, P1, P2, P3, t)
        e = t * t * (3 - 2 * t)
        out.append((x, y0 + (yc - y0) * e, z))
    return out


def build_cage() -> bmesh.types.BMesh:
    """Leva polovina kaveza (Blender prostor), sa atributom `panel` i crease ivicama."""
    bm = bmesh.new()
    pan = bm.faces.layers.int.new("panel")
    band = bm.faces.layers.int.new("band")  # traka kolona (tuck..bot = 0); materijal po traci, ne po visini
    crease = bm.edges.layers.float.new("crease_edge")
    cols = B.COLUMNS
    rows = B.ROWS
    grid, pos = [], []
    for row in rows:
        prow, vrow = [], []
        for c in cols:
            z = row_z(row, c)
            x, y = line_point(c, z)
            prow.append((x, y, z))
            vrow.append(bm.verts.new(scene.V(x, y, z)))
        pos.append(prow)
        grid.append(vrow)
    nc = len(cols)
    for i in range(len(rows) - 1):
        for j in range(nc - 1):
            zc = (pos[i][j][2] + pos[i + 1][j][2]) / 2
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            f[pan] = PID[panel_of(i, j, zc)]
            f[band] = j
    for name, value in B.CREASE.items():
        j = cols.index(name)
        for i in range(len(rows) - 1):
            e = bm.edges.get((grid[i][j], grid[i + 1][j]))
            if e is not None:
                e[crease] = value

    A = cols.index("sh")
    nb = len(cols) - 1 - A  # broj traka gornjih kolona (sh..ctr)

    def cap(ri: int, prev: int, front: bool):
        centers = B.FRONT_CAP if front else B.REAR_CAP
        top = pos[ri][A:]
        fracs = [1 - p[0] / top[0][0] for p in top]
        even = list(fracs)
        for b, c in enumerate(cols[A:]):
            if c in ("belt_g", "dlo_g"):
                even[b] = (fracs[b - 1] + fracs[b + 1]) / 2
        V = [[None] * (nb + 1) for _ in range(A + 1)]
        for a in range(A + 1):
            V[a][0] = grid[ri][a]
        for b in range(nb + 1):
            V[A][b] = grid[ri][A + b]
        for a in range(A):
            w = (a / A) ** 3
            fa = [e + (f - e) * w for e, f in zip(even, fracs)]
            wrap = _wrap_points(pos[ri][a], pos[prev][a], centers[cols[a]], fa[1:], B.CAP_HANDLE["front" if front else "rear"])
            for b in range(1, nb + 1):
                x, y, z = wrap[b - 1]
                V[a][b] = bm.verts.new(scene.V(0.0 if b == nb else x, y, z))
        for a in range(A):
            for b in range(nb):
                name = panel_of_cap(front, a, b)
                if name is None:
                    continue
                f = bm.faces.new((V[a][b], V[a + 1][b], V[a + 1][b + 1], V[a][b + 1]))
                f[pan] = PID[name]
                f[band] = a
        value = B.CREASE_CAP_TOP["front" if front else "rear"]
        for b in range(nb):
            e = bm.edges.get((V[A][b], V[A][b + 1]))
            if e is not None:
                e[crease] = value
        for name, val in B.CREASE_CAP.items():
            a = cols.index(name)
            for b in range(nb):
                e = bm.edges.get((V[a][b], V[a][b + 1]))
                if e is not None:
                    e[crease] = val

    cap(0, 1, True)
    cap(len(rows) - 1, len(rows) - 2, False)
    for f in bm.faces:
        f.smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    # spoljašnja normala boka mora da gleda ka +x
    mid = grid[len(rows) // 2]
    probe = next(iter(bm.edges.get((mid[3], mid[4])).link_faces))
    if probe.normal.x < 0:
        for f in bm.faces:
            f.normal_flip()
    return bm


def subdivided_body(quality: str) -> bpy.types.Object:
    """Kavez -> Mirror -> Subdivision -> pečena mreža cele karoserije (pomoćni objekat)."""
    bm = build_cage()
    me = bpy.data.meshes.new("a3_cage")
    bm.to_mesh(me)
    bm.free()
    cage = bpy.data.objects.new("a3_cage", me)
    scene.helper_collection().objects.link(cage)
    m = cage.modifiers.new("mirror", "MIRROR")
    m.use_axis = (True, False, False)
    m.use_clip = True
    m.use_mirror_merge = True
    m.merge_threshold = 0.0005
    s = cage.modifiers.new("subsurf", "SUBSURF")
    s.levels = s.render_levels = B.SUBDIV[quality]
    s.use_creases = True
    s.boundary_smooth = "ALL"
    s.use_limit_surface = True
    s.quality = 3
    dg = bpy.context.evaluated_depsgraph_get()
    ev = cage.evaluated_get(dg)
    baked = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    body = bpy.data.objects.new("a3_body", baked)
    scene.helper_collection().objects.link(body)
    bpy.data.objects.remove(cage, do_unlink=True)
    bpy.data.meshes.remove(me)
    return body


# --------------------------------------------------------------------------- lukovi i otvori


def _veh(co) -> tuple[float, float, float]:
    return scene.to_vehicle(co)


ARCHES = [(D.Z_AXLE_F, D.Y_WHEEL_F, D.ARCH_R_F), (D.Z_AXLE_R, D.Y_WHEEL_R, D.ARCH_R_R)]


def _in_arch(z: float, y: float, margin: float = 0.0) -> tuple[float, float, float] | None:
    for zc, yc, r in ARCHES:
        dz = z - zc
        rr = r + margin
        if y >= yc:
            if dz * dz + (y - yc) ** 2 < rr * rr:
                return (zc, yc, r)
        elif abs(dz) < rr:
            return (zc, yc, r)
    return None


def arch_distance(z: float, y: float) -> float:
    """Rastojanje tačke (bočni pogled) do ivice najbližeg luka."""
    best = 9.0
    for zc, yc, r in ARCHES:
        dz = z - zc
        d = abs(math.hypot(dz, y - yc) - r) if y >= yc else abs(abs(dz) - r)
        best = min(best, d)
    return best


def cut_arches(bm: bmesh.types.BMesh) -> None:
    """Briše lica u luku i poravnava novu ivicu na krug. Poravnavaju se samo temena koja su delila
    lice sa obrisanim (nova ivica luka), pa i krupna lite mreža dobija čist luk (A06)."""
    kill = []
    for f in bm.faces:
        x, y, z = _veh(f.calc_center_median())
        if abs(x) > 0.45 and _in_arch(z, y):
            kill.append(f)
    killed = set(kill)
    rim = {v for f in kill for v in f.verts if any(g not in killed for g in v.link_faces)}
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    for v in rim:
        if not v.is_valid:
            continue
        x, y, z = _veh(v.co)
        for zc, yc, r in ARCHES:
            dz = z - zc
            if abs(dz) > r + 0.12:
                continue
            if y >= yc:
                k = r / max(math.hypot(dz, y - yc), 1e-6)
                z2, y2 = zc + dz * k, yc + (y - yc) * k
            else:
                z2, y2 = zc + math.copysign(r, dz), y
            v.co = scene.V(x, y2, z2)


def flare_arches(bm: bmesh.types.BMesh) -> None:
    """Blago proširenje boka uz ivicu luka (A01 §1.4.5): +FLARE po x, glatko do nule na FLARE_BAND."""
    for v in bm.verts:
        x, y, z = _veh(v.co)
        if abs(x) < 0.80 or y < 0.15:
            continue
        d = arch_distance(z, y)
        if d >= B.FLARE_BAND:
            continue
        t = 1 - d / B.FLARE_BAND
        v.co = scene.V(x + math.copysign(B.FLARE * t * t * (3 - 2 * t), x), y, z)


def cut_box(bm: bmesh.types.BMesh, test) -> list[bmesh.types.BMFace]:
    """Briše lica čiji centar zadovoljava test(x, y, z, normala_vozila); vraća kopiju obrisanih (za sočiva)."""
    kill = []
    for f in bm.faces:
        x, y, z = _veh(f.calc_center_median())
        n = _veh(f.normal)
        if test(x, y, z, n):
            kill.append(f)
    return kill


# --------------------------------------------------------------------------- izdvajanje panela


def extract(bm_full: bmesh.types.BMesh, keep) -> bmesh.types.BMesh:
    """Nova bmesh sa licima za koja je keep(face) tačno."""
    bm = bm_full.copy()
    bm.faces.ensure_lookup_table()
    pan = bm.faces.layers.int.get("panel")
    kill = [f for f in bm.faces if not keep(f, pan)]
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    return bm


def finish_panel(bm: bmesh.types.BMesh, gap: bool = True, flange: bool = True) -> list[tuple[float, float, float]]:
    """Uvlačenje ivice za pola fuge i povratna prirubnica (A01 §1.5).

    Vraća spoljnu ivicu panela (prostor vozila) posle uvlačenja, pre prirubnice: na njoj se meri fuga.
    """
    if gap and bm.faces:
        res = bmesh.ops.inset_region(bm, faces=list(bm.faces), thickness=B.GAP_HALF, depth=0.0, use_boundary=True,
                                     use_even_offset=False, use_interpolate=True)
        bmesh.ops.delete(bm, geom=res["faces"], context="FACES")
    edge = [_veh(v.co) for v in bm.verts if v.is_boundary]
    if not flange:
        return edge
    bm.normal_update()
    boundary = [e for e in bm.edges if e.is_boundary]
    normals = {v: v.normal.copy() for e in boundary for v in e.verts}
    # A07: ivica otvora svetla dobija kratku prirubnicu (4 mm), da ne prolazi kroz sočivo i kućište
    from body import openings

    lamp_ops = [op for op in openings.STATE.get("ops", []) if op.name.startswith("svetla")]
    short = set()
    if lamp_ops:
        for v in normals:
            p = _veh(v.co)
            if any(op.near(p, 0.01) and abs(op.sd(p)) < 0.006 for op in lamp_ops):
                short.add(v)
    res = bmesh.ops.extrude_edge_only(bm, edges=boundary)
    new_verts = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    for nv in new_verts:
        src = None
        for e in nv.link_edges:
            o = e.other_vert(nv)
            if o in normals:
                src = o
                break
        if src is None:
            continue
        x, y, z = _veh(src.co)
        g = B.OPEN_GRILLE
        if abs(x) > 0.45 and arch_distance(z, y) < 0.006:
            nv.co = src.co + Vector((-math.copysign(B.ARCH_FLANGE, x), 0.0, 0.0))
        elif z > g["z_min"] and abs(x) < g["x"] and g["y"][0] < y < g["y"][1]:
            nv.co = src.co + scene.V(0.0, 0.0, -B.GRILLE_FLANGE)
        elif src in short:
            nv.co = src.co - normals[src] * B.FLANGE_LAMP
        elif z > 2.0 and B.HOOD_EDGE_Y[0] < y < B.HOOD_EDGE_Y[1]:
            nv.co = src.co - normals[src] * B.FLANGE_HOOD_FRONT  # A07: far je tik ispod ivice haube
        else:
            nv.co = src.co - normals[src] * B.FLANGE
    for f in bm.faces:
        f.smooth = True
    return edge


def offset_shell(bm: bmesh.types.BMesh, inset: float, thickness: float) -> None:
    """Pomera površinu ka unutra (staklo u okviru) i daje joj debljinu."""
    bm.normal_update()
    moves = {v: v.normal.copy() for v in bm.verts}
    for v, n in moves.items():
        v.co = v.co - n * inset
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=thickness)
    for f in bm.faces:
        f.smooth = True


def to_object(name: str, bm: bmesh.types.BMesh, materials: list[str], mat_index=None) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    for m in materials:
        me.materials.append(bpy.data.materials[m])
    if mat_index is not None:
        layer = me.attributes.get("band")
        idx = [mat_index(p, layer.data[p.index].value if layer else -1) for p in me.polygons]
        me.polygons.foreach_set("material_index", idx)
    obj = bpy.data.objects.new(name, me)
    scene.helper_collection().objects.link(obj)
    return obj


def hem_bevel(obj: bpy.types.Object, width: float) -> None:
    from .finish import bake_modifiers

    b = obj.modifiers.new("hem", "BEVEL")
    b.limit_method = "ANGLE"
    b.angle_limit = math.radians(60)
    b.width = width
    b.segments = 2
    b.use_clamp_overlap = True
    b.harden_normals = False
    bake_modifiers(obj)
    obj.data.set_sharp_from_angle(angle=math.radians(55))
