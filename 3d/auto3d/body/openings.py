"""Otvori svetala, usisnika i auspuha u pečenoj karoseriji (A07).

Ugao nosa i repa se parametrizuje u (u, v):
- v je visina y;
- u je dužina u tlocrtu: na čelu u = |x| − XS (ray po z), a oko ugla u = θ · RC, gde je θ ugao oko
  tačke C = (XS, ZC) u tlocrtu (ray ka C). Tako jedan obris prati čelo, ugao i bok bez preloma.
Obris otvora je mnogougao u (u, v), isti za levu i desnu stranu (u koristi |x|).

Sečenje (pre podele na panele, na celoj pečenoj mreži):
1. lica u pojasu oko obrisa se usitnjavaju (linearno, oblik se ne menja);
2. lica sa centrom u obrisu se brišu;
3. temena nove ivice se pomeraju na obris i vraćaju zrakom na prvobitnu površinu.
Ivica otvora je zato glatka kriva, a `finish_panel` joj posle daje fugu i povratnu prirubnicu.
"""

from __future__ import annotations

import math

import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

from lib import scene

XS = 0.55
RC = 0.40
ZC = {"front": 1.90, "rear": -2.15}


class Param:
    """(u, v) parametar ugla nosa (front) ili repa (rear), u prostoru vozila."""

    def __init__(self, end: str) -> None:
        self.end = end
        self.zc = ZC[end]
        self.s = 1.0 if end == "front" else -1.0  # smer „ka spolja“ po z

    def uv(self, p) -> tuple[float, float]:
        x = abs(p[0])
        if x <= XS:
            return (x - XS, p[1])
        th = math.atan2(x - XS, self.s * (p[2] - self.zc))
        return (th * RC, p[1])

    def ray(self, u: float, v: float, side: float = 1.0) -> tuple[Vector, Vector]:
        if u <= 0.0:
            return Vector((side * (XS + u), v, self.s * 4.0)), Vector((0.0, 0.0, -self.s))
        th = u / RC
        d = Vector((side * math.sin(th), 0.0, self.s * math.cos(th)))
        o = Vector((side * XS, v, self.zc)) + d * 3.0
        return o, -d


class Surface:
    """BVH površine u prostoru vozila (iz bmesh-a u Blender prostoru)."""

    def __init__(self, bm: bmesh.types.BMesh, faces=None) -> None:
        faces = list(bm.faces) if faces is None else faces
        index: dict = {}
        verts: list[Vector] = []
        polys = []
        for f in faces:
            poly = []
            for v in f.verts:
                k = index.get(v)
                if k is None:
                    k = index[v] = len(verts)
                    verts.append(Vector(scene.to_vehicle(v.co)))
                poly.append(k)
            polys.append(poly)
        self.tree = BVHTree.FromPolygons(verts, polys)

    def hit(self, param: Param, u: float, v: float, side: float = 1.0):
        o, d = param.ray(u, v, side)
        loc, nrm, _i, _d = self.tree.ray_cast(o, d)
        return (loc, nrm) if loc is not None else (None, None)


# --------------------------------------------------------------------------- obrisi


def rounded_rect_uv(u0: float, u1: float, v0: float, v1: float, r: float, n: int = 6) -> list[tuple[float, float]]:
    pts = []
    for cu, cv, a0 in ((u1 - r, v0 + r, -90), (u1 - r, v1 - r, 0), (u0 + r, v1 - r, 90), (u0 + r, v0 + r, 180)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cu + r * math.cos(a), cv + r * math.sin(a)))
    return pts


def circle_uv(cu: float, cv: float, r: float, n: int = 24) -> list[tuple[float, float]]:
    return [(cu + r * math.cos(2 * math.pi * k / n), cv + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def _seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0.0 if L < 1e-14 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L))
    qx, qy = ax + t * dx, ay + t * dy
    return math.hypot(px - qx, py - qy), qx, qy


def signed_distance(poly, u: float, v: float) -> tuple[float, tuple[float, float]]:
    """(rastojanje, najbliža tačka obrisa); negativno unutra."""
    best, q = 1e9, (u, v)
    inside = False
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        if (ay > v) != (by > v) and u < ax + (v - ay) * (bx - ax) / (by - ay):
            inside = not inside
        d, qx, qy = _seg_dist(u, v, ax, ay, bx, by)
        if d < best:
            best, q = d, (qx, qy)
    return (-best if inside else best), q


class Opening:
    def __init__(self, name: str, end: str, poly, sides=(1.0, -1.0), panels=None) -> None:
        self.name = name
        self.param = Param(end)
        self.poly = poly
        self.sides = sides
        self.panels = panels  # dozvoljeni ID-jevi panela (None = svi)
        us = [p[0] for p in poly]
        vs = [p[1] for p in poly]
        self.box = (min(us), max(us), min(vs), max(vs))

    def side_ok(self, x: float) -> bool:
        s = 1.0 if x >= 0 else -1.0
        return s in self.sides

    def near(self, p, margin: float) -> bool:
        if (p[2] - self.param.zc) * self.param.s < 0.0 or not self.side_ok(p[0]):
            return False
        u, v = self.param.uv(p)
        b = self.box
        return b[0] - margin <= u <= b[1] + margin and b[2] - margin <= v <= b[3] + margin

    def sd(self, p) -> float:
        u, v = self.param.uv(p)
        return signed_distance(self.poly, u, v)[0]


# --------------------------------------------------------------------------- sečenje


class _PhongSource:
    """Glatka površina pre usitnjavanja: lica, temena i normale temena (prostor vozila)."""

    def __init__(self, bm: bmesh.types.BMesh) -> None:
        bm.normal_update()
        index = {v: i for i, v in enumerate(bm.verts)}
        self.co = [Vector(scene.to_vehicle(v.co)) for v in bm.verts]
        self.no = [Vector(scene.to_vehicle(v.normal)).normalized() for v in bm.verts]
        self.polys = [[index[v] for v in f.verts] for f in bm.faces]
        self.tree = BVHTree.FromPolygons(self.co, self.polys)

    def project(self, p: Vector, alpha: float = 0.75) -> Vector:
        """Phong tessellation: tačka sa ravnog lica -> glatka površina kroz normale temena."""
        from mathutils.interpolate import poly_3d_calc

        loc, _n, fi, _d = self.tree.find_nearest(p)
        if loc is None:
            return p
        ids = self.polys[fi]
        pts = [self.co[i] for i in ids]
        w = poly_3d_calc(pts, loc)
        star = Vector()
        for wi, i in zip(w, ids):
            c, n = self.co[i], self.no[i]
            star += wi * (loc - (loc - c).dot(n) * n)
        return loc * (1 - alpha) + star * alpha


def _phong(bm: bmesh.types.BMesh, src: _PhongSource, orig: set) -> None:
    """Nova temena usitnjavanja leže na ravnim licima: vrati ih na glatku površinu, inače senčenje
    oko otvora ima talase (normale novih temena su normale ravnih lica)."""
    for v in bm.verts:
        if v in orig:
            continue
        p = src.project(Vector(scene.to_vehicle(v.co)))
        v.co = scene.V(p.x, p.y, p.z)
    bm.normal_update()


def _face_ok(f, op: Opening, pan) -> bool:
    return op.panels is None or f[pan] in op.panels


def cut(bm: bmesh.types.BMesh, openings: list[Opening], refine: int = 2, band: float = 0.03) -> dict:
    """Seče sve otvore; vraća broj obrisanih lica po otvoru."""
    pan = bm.faces.layers.int.get("panel")
    stats = {}
    phong = _PhongSource(bm)
    orig = set(bm.verts)
    # 1. usitnjavanje pojasa oko obrisa
    for _ in range(refine):
        edges = set()
        for f in bm.faces:
            c = scene.to_vehicle(f.calc_center_median())
            for op in openings:
                if _face_ok(f, op, pan) and op.near(c, band) and abs(op.sd(c)) < band:
                    edges.update(f.edges)
                    break
        if edges:
            bmesh.ops.subdivide_edges(bm, edges=list(edges), cuts=1, use_grid_fill=True, use_single_edge=False)
        band *= 0.6
    _phong(bm, phong, orig)
    bm.faces.ensure_lookup_table()
    surf = Surface(bm)
    STATE["surf"] = surf
    # 2. brisanje
    for op in openings:
        kill = []
        for f in bm.faces:
            c = scene.to_vehicle(f.calc_center_median())
            if _face_ok(f, op, pan) and op.near(c, 0.0) and op.sd(c) < 0.0:
                kill.append(f)
        killed = set(kill)
        rim = {v for f in kill for v in f.verts if any(g not in killed for g in v.link_faces)}
        bmesh.ops.delete(bm, geom=kill, context="FACES")
        # 3. poravnanje ivice na obris
        moved = 0
        for v in rim:
            if not v.is_valid or not v.link_faces:
                continue
            if op.panels is not None and any(f[pan] not in op.panels for f in v.link_faces):
                continue  # granica sa drugim panelom (ivica haube) ostaje gde je
            p = scene.to_vehicle(v.co)
            side = 1.0 if p[0] >= 0 else -1.0
            u, vv = op.param.uv(p)
            _d, (qu, qv) = signed_distance(op.poly, u, vv)
            loc, _n = surf.hit(op.param, qu, qv, side)
            if loc is None:
                continue
            v.co = scene.V(loc.x, loc.y, loc.z)
            moved += 1
        stats[op.name] = (len(kill), moved)
    bm.normal_update()
    return stats


# --------------------------------------------------------------------------- pomoć za svetla


def face_top(surf: Surface, param: Param, u: float, y_hi: float, y_lo: float, max_up: float = 0.45) -> float:
    """Najviša visina (od y_hi naniže) na kojoj je površina još „lice“ (normala nije okrenuta nagore)."""
    y = y_hi
    while y > y_lo:
        loc, n = surf.hit(param, u, y)
        if loc is not None and n is not None and abs(n.y) < max_up:
            return y
        y -= 0.002
    return y_lo


# --------------------------------------------------------------------------- otvori limuzine

STATE: dict = {}  # posle cut(): "surf" (površina pre brisanja), "strips", "ops"


def _smooth(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _boundary(bm: bmesh.types.BMesh, pid_a: int, pid_b: int, param: Param):
    """Kriva v(u) granice dva panela (npr. ivica haube iznad branika), usrednjena po 1 cm."""
    pan = bm.faces.layers.int.get("panel")
    bins: dict[int, list[float]] = {}
    for v in bm.verts:
        ids = {f[pan] for f in v.link_faces}
        if pid_a in ids and pid_b in ids:
            p = scene.to_vehicle(v.co)
            if p[0] < 0 or (p[2] - param.zc) * param.s < 0:
                continue
            u, vv = param.uv(p)
            bins.setdefault(int(round(u * 100)), []).append(vv)
    keys = sorted(bins)
    us = [k / 100 for k in keys]
    vs = [sum(bins[k]) / len(bins[k]) for k in keys]

    def f(u: float) -> float:
        if not us:
            return 0.713
        if u <= us[0]:
            return vs[0]
        if u >= us[-1]:
            return vs[-1]
        for i in range(1, len(us)):
            if u <= us[i]:
                t = (u - us[i - 1]) / (us[i] - us[i - 1])
                return vs[i - 1] + (vs[i] - vs[i - 1]) * t
        return vs[-1]

    return f


class Strip:
    """Traka svetla: od u0 do u1, gornja ivica top(u), visina height(u).

    round = "both": krajevi zaobljeni i gore i dole; "bottom": gornja ivica ide prava do kraja, a
    donja se zaobljeno penje (far tik ispod ivice haube). lift podiže gornju ivicu obrisa za sečenje
    (iznad granice panela, pa se branik briše do same ivice haube)."""

    def __init__(self, end: str, u0: float, u1: float, top, height, r_end: float, round_: str = "both", lift: float = 0.0) -> None:
        self.end, self.u0, self.u1, self.top, self.height, self.r_end = end, u0, u1, top, height, r_end
        self.round, self.lift = round_, lift

    def _k(self, u: float) -> float:
        e = min(u - self.u0, self.u1 - u) / max(self.r_end, 1e-6)
        return math.sqrt(max(0.0, 1.0 - (1.0 - min(max(e, 0.0), 1.0)) ** 2))

    def span(self, u: float) -> tuple[float, float]:
        """(donja, gornja) ivica sočiva u tački u."""
        t, h, k = self.top(u), self.height(u), self._k(u)
        if self.round == "bottom":
            return t - h * k, t
        mid = t - h / 2
        return mid - h / 2 * k, mid + h / 2 * k

    def outline(self, n: int = 72, grow: float = 0.003) -> list[tuple[float, float]]:
        """Obris za sečenje: `grow` veći od sočiva (dole i na krajevima), da uzan vrh otvora bude
        isečen do kraja i da sočivo nigde ne dodiruje lim."""
        us = [self.u0 + (self.u1 - self.u0) * i / n for i in range(n + 1)]
        upper = [(u, self.span(u)[1] + (self.lift if self.lift else grow)) for u in us]
        lower = [(u, self.span(u)[0] - grow) for u in us]
        end = [(self.u1 + grow * 2, (self.span(self.u1)[0] + self.span(self.u1)[1]) / 2 + (self.lift / 2 if self.lift else 0.0))]
        return upper + end + list(reversed(lower))[1:-1]


# udubljenje tablice (u0, u1, v0, v1): u0 je preko sredine, pa obris obuhvata obe strane
PLATE = (-0.70, -0.265, 0.452, 0.602)
PLATE_F = (-0.70, -0.275, 0.498, 0.618)  # A07: prednja tablica iznad maske (obavezna u Srbiji; puni prazno lice)

# granica LED traka / far (napred) i LED traka / stop svetlo (pozadi), u = |x| − XS
SPLIT_F = -0.205
SPLIT_R = -0.06


def define(bm: bmesh.types.BMesh, pid: dict) -> list[Opening]:
    pf, pr = Param("front"), Param("rear")
    hood = _boundary(bm, pid["hauba"], pid["branik_prednji"], pf)

    def top_f(u: float) -> float:
        return hood(u) - 0.010  # sočivo ispod ivice haube: fuga 2,35 mm + skraćena prirubnica haube (6 mm)

    def h_f(u: float) -> float:
        # LED traka 16 mm, pa korak do fara od 60 mm (sužava se ka kraju oko ugla)
        k = _smooth((u - (SPLIT_F - 0.005)) / 0.05)
        tail = 1.0 - 0.25 * _smooth((u - 0.22) / 0.16)
        return 0.016 + (0.060 * tail - 0.016) * k

    front = Strip("front", -0.62, 0.375, top_f, h_f, 0.045, round_="bottom", lift=0.03)

    def top_r(u: float) -> float:
        # na uglu je oštra ivica repa (rame, y ≈ 0,968): gornja ivica svetla se spušta 15+ mm ispod nje
        return 0.972 - 0.030 * _smooth((u - 0.15) / 0.15)

    def h_r(u: float) -> float:
        k = _smooth((u - (SPLIT_R - 0.004)) / 0.045)
        tail = 1.0 - 0.2 * _smooth((u - 0.25) / 0.16)
        return 0.014 + (0.050 * tail - 0.014) * k

    rear = Strip("rear", -0.62, 0.42, top_r, h_r, 0.018)

    # bočni usisnici: zaobljen trapez, spoljna ivica nagnuta ka unutra pri vrhu
    base = rounded_rect_uv(0.065, 0.300, 0.172, 0.385, 0.032, 6)
    intake = [(u - 0.11 * max(0.0, u - 0.15) / 0.15 * (v - 0.172) / 0.213, v) for u, v in base]

    # udubljenje za registarsku tablicu na zadnjem braniku (520 × 110 mm + rub), bez tablice
    plate = rounded_rect_uv(PLATE[0], PLATE[1], PLATE[2], PLATE[3], 0.016, 5)

    STATE["strips"] = {"front": front, "rear": rear}
    STATE["intake"] = intake
    front_panels = {pid["branik_prednji"]}
    rear_panels = {pid["poklopac_prtljaznika"], pid["skelet"], pid["branik_zadnji"]}
    ops = [
        Opening("svetla_napred", "front", front.outline(), panels=front_panels),
        Opening("usisnik", "front", intake, panels=front_panels),
        Opening("svetla_pozadi", "rear", rear.outline(), panels=rear_panels),
        Opening("tablica", "rear", plate, panels={pid["branik_zadnji"]}),
    ]
    STATE["ops"] = ops
    return ops


def ensure(quality: str) -> None:
    """Stanje otvora za svetla kad karoserija nije građena u ovom pokretanju (--only elektrika)."""
    if "surf" in STATE and STATE.get("quality") == quality:
        return
    import bpy

    from lib import cage

    body = cage.subdivided_body(quality)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bpy.data.objects.remove(body, do_unlink=True)
    cage.cut_arches(bm)
    cage.flare_arches(bm)
    cut(bm, define(bm, cage.PID), refine=REFINE[quality])
    bm.free()
    STATE["quality"] = quality


REFINE = {"desktop": 2, "lite": 2}  # lite sa 1: uska LED traka (14 mm) nije isečena celom dužinom
