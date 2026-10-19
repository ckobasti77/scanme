"""Procedural geometry toolkit (vehicle-local coordinates: x = left, y = up, z = front).

A `Geo` collects faces with a material name, optional per-corner UVs and a `hard` flag.
Hard faces get sharp edges + bevel weights where the dihedral angle exceeds the threshold;
soft faces (tubes, springs, belts, tyres, castings smoothed by the profile) never do.
`Geo.to_mesh()` converts to Blender space (x, -z, y) — a proper rotation, so winding stays.
"""

from __future__ import annotations

import math
from typing import Callable, Iterable, Sequence

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.geometry import delaunay_2d_cdt

TAU = math.tau

# --------------------------------------------------------------------------- matrices


def T(x: float = 0.0, y: float = 0.0, z: float = 0.0) -> Matrix:
    return Matrix.Translation((x, y, z))


def R(axis: str, deg: float) -> Matrix:
    return Matrix.Rotation(math.radians(deg), 4, axis.upper())


def S(x: float, y: float | None = None, z: float | None = None) -> Matrix:
    y = x if y is None else y
    z = x if z is None else z
    return Matrix.Diagonal((x, y, z, 1.0))


def axis_to(axis: str) -> Matrix:
    """Matrix mapping the local +Y axis (lathe axis) onto the requested vehicle axis."""
    a = axis.lower()
    if a in ("y", "+y"):
        return Matrix.Identity(4)
    if a in ("-y",):
        return R("x", 180)
    if a in ("x", "+x"):
        return R("z", -90)
    if a in ("-x",):
        return R("z", 90)
    if a in ("z", "+z"):
        return R("x", 90)
    if a in ("-z",):
        return R("x", -90)
    raise ValueError(axis)


def look_axis(direction: Vector) -> Matrix:
    """Rotation mapping +Y onto `direction`."""
    d = Vector(direction).normalized()
    q = Vector((0, 1, 0)).rotation_difference(d)
    return q.to_matrix().to_4x4()


# --------------------------------------------------------------------------- core container


class Geo:
    __slots__ = ("verts", "faces", "mats", "uvs", "hard")

    def __init__(self) -> None:
        self.verts: list[Vector] = []
        self.faces: list[tuple[int, ...]] = []
        self.mats: list[str] = []
        self.uvs: list[tuple[tuple[float, float], ...] | None] = []
        self.hard: list[bool] = []

    # -- building
    def v(self, co) -> int:
        self.verts.append(Vector(co))
        return len(self.verts) - 1

    def f(self, idx: Sequence[int], mat: str, uv=None, hard: bool = True) -> None:
        self.faces.append(tuple(idx))
        self.mats.append(mat)
        self.uvs.append(tuple(uv) if uv is not None else None)
        self.hard.append(hard)

    def extend(self, other: "Geo", matrix: Matrix | None = None) -> "Geo":
        off = len(self.verts)
        if matrix is None:
            self.verts.extend(v.copy() for v in other.verts)
        else:
            self.verts.extend(matrix @ v for v in other.verts)
        self.faces.extend(tuple(i + off for i in f) for f in other.faces)
        self.mats.extend(other.mats)
        self.uvs.extend(other.uvs)
        self.hard.extend(other.hard)
        return self

    def __iadd__(self, other: "Geo") -> "Geo":
        return self.extend(other)

    def copy(self) -> "Geo":
        g = Geo()
        return g.extend(self)

    def transform(self, m: Matrix) -> "Geo":
        self.verts = [m @ v for v in self.verts]
        if m.determinant() < 0:
            self.faces = [tuple(reversed(f)) for f in self.faces]
            self.uvs = [tuple(reversed(u)) if u is not None else None for u in self.uvs]
        return self

    def moved(self, x=0.0, y=0.0, z=0.0) -> "Geo":
        return self.transform(T(x, y, z))

    def set_mat(self, mat: str) -> "Geo":
        self.mats = [mat] * len(self.faces)
        return self

    def set_hard(self, hard: bool) -> "Geo":
        self.hard = [hard] * len(self.faces)
        return self

    def mirrored_x(self) -> "Geo":
        """Mirror across the vehicle centre plane (x -> -x), fixing winding."""
        return self.copy().transform(S(-1, 1, 1))

    def tri_count(self) -> int:
        return sum(len(f) - 2 for f in self.faces)

    def bbox(self) -> tuple[Vector, Vector]:
        xs = [v.x for v in self.verts]
        ys = [v.y for v in self.verts]
        zs = [v.z for v in self.verts]
        return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))

    # -- output
    def to_mesh(
        self,
        name: str,
        mat_order: Sequence[str] | None = None,
        sharp_angle: float = 30.0,
        uv_tile: float = 0.08,
    ) -> bpy.types.Mesh:
        mats = list(mat_order) if mat_order else []
        for m in self.mats:
            if m not in mats:
                mats.append(m)
        mesh = bpy.data.meshes.new(name)
        verts_bl = [(v.x, -v.z, v.y) for v in self.verts]
        mesh.from_pydata(verts_bl, [], self.faces)
        mesh.validate(clean_customdata=False)
        for m in mats:
            mat = bpy.data.materials.get(m)
            if mat is None:
                raise KeyError(f"material {m} missing — create the library first")
            mesh.materials.append(mat)
        index = {m: i for i, m in enumerate(mats)}
        n = len(mesh.polygons)
        if n != len(self.faces):
            raise RuntimeError(f"{name}: validate() changed face count {len(self.faces)} -> {n}")
        mesh.polygons.foreach_set("material_index", [index[m] for m in self.mats])
        mesh.polygons.foreach_set("use_smooth", [True] * n)
        # UVs: explicit where given, box projection (vehicle-local, tile uv_tile m) elsewhere.
        uv_layer = mesh.uv_layers.new(name="UVMap")
        uvdata = [0.0] * (len(mesh.loops) * 2)
        for p, face_uv in zip(mesh.polygons, self.uvs):
            loops = range(p.loop_start, p.loop_start + p.loop_total)
            if face_uv is not None and len(face_uv) == p.loop_total:
                for k, li in enumerate(loops):
                    uvdata[2 * li] = face_uv[k][0]
                    uvdata[2 * li + 1] = face_uv[k][1]
            else:
                nrm = p.normal
                ax = max(range(3), key=lambda a: abs(nrm[a]))
                a, b = [(1, 2), (0, 2), (0, 1)][ax]
                for li in loops:
                    co = mesh.vertices[mesh.loops[li].vertex_index].co
                    uvdata[2 * li] = co[a] / uv_tile
                    uvdata[2 * li + 1] = co[b] / uv_tile
        uv_layer.data.foreach_set("uv", uvdata)
        # Sharp edges + bevel weights from dihedral angles on hard faces only.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.faces.ensure_lookup_table()
        hard = self.hard
        bw = bm.edges.layers.float.get("bevel_weight_edge") or bm.edges.layers.float.new("bevel_weight_edge")
        limit = math.radians(sharp_angle)
        for e in bm.edges:
            if len(e.link_faces) != 2:
                e.smooth = True
                e[bw] = 0.0
                continue
            f1, f2 = e.link_faces
            both_hard = hard[f1.index] and hard[f2.index]
            ang = e.calc_face_angle(0.0)
            sharp = ang > limit and (both_hard or ang > math.radians(75))
            e.smooth = not sharp
            e[bw] = 1.0 if (sharp and both_hard) else 0.0
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        return mesh


# --------------------------------------------------------------------------- 2D helpers


def arc2d(cx: float, cy: float, r: float, a0: float, a1: float, n: int) -> list[tuple[float, float]]:
    """Points on an arc from angle a0 to a1 (degrees), inclusive."""
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle2d(r: float, n: int, cx: float = 0.0, cy: float = 0.0, phase: float = 0.0) -> list[tuple[float, float]]:
    return [(cx + r * math.cos(phase + TAU * i / n), cy + r * math.sin(phase + TAU * i / n)) for i in range(n)]


def rounded_rect(w: float, h: float, r: float, n: int = 4, cx: float = 0.0, cy: float = 0.0) -> list[tuple[float, float]]:
    r = min(r, w / 2 - 1e-5, h / 2 - 1e-5)
    hw, hh = w / 2, h / 2
    pts: list[tuple[float, float]] = []
    corners = [(hw - r, hh - r, 0), (-hw + r, hh - r, 90), (-hw + r, -hh + r, 180), (hw - r, -hh + r, 270)]
    for x, y, a in corners:
        if r <= 1e-6:
            pts.append((cx + x, cy + y))
        else:
            pts.extend((cx + px, cy + py) for px, py in arc2d(x, y, r, a, a + 90, n))
    return pts


def offset_polygon(poly: Sequence[tuple[float, float]], d: float) -> list[tuple[float, float]]:
    """Naive miter offset of a closed CCW polygon (positive d = outward)."""
    n = len(poly)
    out = []
    for i in range(n):
        p0 = Vector(poly[i - 1])
        p1 = Vector(poly[i])
        p2 = Vector(poly[(i + 1) % n])
        e1 = (p1 - p0).normalized()
        e2 = (p2 - p1).normalized()
        n1 = Vector((e1.y, -e1.x))
        n2 = Vector((e2.y, -e2.x))
        nm = (n1 + n2)
        if nm.length < 1e-6:
            nm = n1
        nm.normalize()
        cosh = max(0.2, nm.dot(n1))
        q = p1 + nm * (d / cosh)
        out.append((q.x, q.y))
    return out


def gear2d(teeth: int, r_root: float, r_tip: float, tip_frac: float = 0.35, root_frac: float = 0.35, sub: int = 1) -> list[tuple[float, float]]:
    """Trapezoidal gear / sprocket outline (CCW)."""
    pts = []
    step = TAU / teeth
    for i in range(teeth):
        a = i * step
        a_root0 = a
        a_root1 = a + step * root_frac
        a_tip0 = a + step * (0.5 - tip_frac / 2)
        a_tip1 = a + step * (0.5 + tip_frac / 2)
        a_next = a + step * (1 - root_frac * 0.0)
        for ang, r in ((a_root0, r_root), (a_root1, r_root), (a_tip0, r_tip), (a_tip1, r_tip)):
            pts.append((r * math.cos(ang), r * math.sin(ang)))
        # descend flank ends at next root start (added by next iteration)
        _ = a_next
    return pts


def polygon_area(poly: Sequence[tuple[float, float]]) -> float:
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i - 1]
        x1, y1 = poly[i]
        a += x0 * y1 - x1 * y0
    return a / 2


def ccw(poly: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    return list(poly) if polygon_area(poly) > 0 else list(reversed(poly))


def cw(poly: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    return list(reversed(ccw(poly)))


# --------------------------------------------------------------------------- 3D path helpers


def catmull(points: Sequence, samples: int = 8, closed: bool = False) -> list[Vector]:
    """Centripetal-ish Catmull-Rom through control points (uniform parametrisation)."""
    P = [Vector(p) for p in points]
    if len(P) < 3:
        return P
    out: list[Vector] = []
    n = len(P)
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = P[(i - 1) % n] if closed else P[max(i - 1, 0)]
        p1 = P[i]
        p2 = P[(i + 1) % n]
        p3 = P[(i + 2) % n] if closed else P[min(i + 2, n - 1)]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(
                0.5
                * (
                    (2 * p1)
                    + (-p0 + p2) * t
                    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
                )
            )
    if not closed:
        out.append(P[-1].copy())
    return out


def bezier_path(p0, p1, p2, p3, n: int = 16) -> list[Vector]:
    a, b, c, d = (Vector(p) for p in (p0, p1, p2, p3))
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(a * u**3 + b * 3 * u * u * t + c * 3 * u * t * t + d * t**3)
    return pts


def polyline_fillet(points: Sequence, radius: float, n: int = 6) -> list[Vector]:
    """Replace interior corners of a polyline by circular fillets (pipe routing)."""
    P = [Vector(p) for p in points]
    if len(P) < 3:
        return P
    out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        d1 = (a - b).normalized()
        d2 = (c - b).normalized()
        ang = d1.angle(d2)
        if ang > math.pi - 1e-3 or ang < 1e-3:
            out.append(b)
            continue
        t = radius / math.tan(ang / 2)
        t = min(t, (a - b).length * 0.49, (c - b).length * 0.49)
        s = b + d1 * t
        e = b + d2 * t
        out.extend(bezier_path(s, s + (b - s) * 0.55, e + (b - e) * 0.55, e, n))
    out.append(P[-1])
    return out


def path_length(points: Sequence[Vector]) -> list[float]:
    acc = [0.0]
    for i in range(1, len(points)):
        acc.append(acc[-1] + (points[i] - points[i - 1]).length)
    return acc


def frames(points: Sequence[Vector], closed: bool = False, up_hint: Vector | None = None):
    """Rotation-minimising frames (tangent, normal, binormal) along a polyline."""
    P = list(points)
    n = len(P)
    tangents = []
    for i in range(n):
        if closed:
            t = P[(i + 1) % n] - P[i - 1]
        elif i == 0:
            t = P[1] - P[0]
        elif i == n - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        tangents.append(t.normalized())
    up = Vector(up_hint) if up_hint is not None else Vector((0, 1, 0))
    if abs(up.dot(tangents[0])) > 0.95:
        up = Vector((1, 0, 0)) if abs(tangents[0].x) < 0.9 else Vector((0, 0, 1))
    nrm = (up - tangents[0] * up.dot(tangents[0])).normalized()
    out = []
    for i in range(n):
        if i > 0:
            q = tangents[i - 1].rotation_difference(tangents[i])
            nrm = (q @ nrm)
            nrm = (nrm - tangents[i] * nrm.dot(tangents[i])).normalized()
        out.append((tangents[i], nrm, tangents[i].cross(nrm)))
    if closed and n > 2:
        # distribute the closing twist evenly
        t0, n0, _ = out[0]
        q = out[-1][0].rotation_difference(t0)
        n_end = (q @ out[-1][1])
        twist = math.atan2(n_end.cross(n0).dot(t0), n_end.dot(n0))
        fixed = []
        for i, (t, nn, b) in enumerate(out):
            a = twist * i / n
            rot = Matrix.Rotation(a, 3, t)
            nn2 = rot @ nn
            fixed.append((t, nn2, t.cross(nn2)))
        out = fixed
    return out


# --------------------------------------------------------------------------- primitives


def lathe(
    profile: Sequence[tuple[float, float]],
    seg: int,
    mat: str,
    axis: str = "y",
    hard: bool = True,
    uv_u: float = 1.0,
    uv_v: float = 1.0,
    angle: float = 360.0,
    phase: float = 0.0,
    close_start: bool = False,
    close_end: bool = False,
    v_list: Sequence[float] | None = None,
) -> Geo:
    """Revolve a (radius, height) profile around the local Y axis, then orient to `axis`.

    Points with radius 0 collapse to a pole. UVs: u = angle fraction * uv_u,
    v = arc length along the profile * uv_v.
    """
    g = Geo()
    full = abs(angle - 360.0) < 1e-6
    steps = seg if full else seg + 1
    lens = [0.0]
    for i in range(1, len(profile)):
        (r0, h0), (r1, h1) = profile[i - 1], profile[i]
        lens.append(lens[-1] + math.hypot(r1 - r0, h1 - h0))
    rings: list[list[int] | int] = []
    for j, (r, h) in enumerate(profile):
        if r <= 1e-7:
            rings.append(g.v((0.0, h, 0.0)))
            continue
        ring = []
        for i in range(steps):
            a = math.radians(phase) + math.radians(angle) * i / seg
            ring.append(g.v((r * math.cos(a), h, -r * math.sin(a))))
        rings.append(ring)
    for j in range(len(profile) - 1):
        A, B = rings[j], rings[j + 1]
        if v_list is not None:
            v0, v1 = v_list[j], v_list[j + 1]
        else:
            v0, v1 = lens[j] * uv_v, lens[j + 1] * uv_v
        for i in range(seg):
            i1 = (i + 1) % steps if full else i + 1
            u0, u1 = i / seg * uv_u, (i + 1) / seg * uv_u
            if isinstance(A, int) and isinstance(B, int):
                continue
            if isinstance(A, int):
                g.f((A, B[i1], B[i]), mat, ((u0, v0), (u1, v1), (u0, v1)), hard)
            elif isinstance(B, int):
                g.f((A[i1], B, A[i]), mat, ((u1, v0), (u0, v1), (u0, v0)), hard)
            else:
                g.f((A[i], A[i1], B[i1], B[i]), mat, ((u0, v0), (u1, v0), (u1, v1), (u0, v1)), hard)
    if not full:
        pass
    if close_start and isinstance(rings[0], list):
        c = g.v((0.0, profile[0][1], 0.0))
        ring = rings[0]
        for i in range(seg):
            g.f((c, ring[(i + 1) % steps], ring[i]), mat, None, hard)
    if close_end and isinstance(rings[-1], list):
        c = g.v((0.0, profile[-1][1], 0.0))
        ring = rings[-1]
        for i in range(seg):
            g.f((c, ring[i], ring[(i + 1) % steps]), mat, None, hard)
    if axis != "y":
        g.transform(axis_to(axis))
    return g


def cylinder(r: float, length: float, seg: int, mat: str, axis: str = "y", center: bool = True, hard: bool = True, r2: float | None = None) -> Geo:
    r2 = r if r2 is None else r2
    y0 = -length / 2 if center else 0.0
    prof = [(0.0, y0), (r, y0), (r2, y0 + length), (0.0, y0 + length)]
    return lathe(prof, seg, mat, axis=axis, hard=hard)


def tube_ring(r_in: float, r_out: float, length: float, seg: int, mat: str, axis: str = "y", hard: bool = True) -> Geo:
    y0 = -length / 2
    prof = [(r_in, y0), (r_out, y0), (r_out, y0 + length), (r_in, y0 + length), (r_in, y0)]
    return lathe(prof, seg, mat, axis=axis, hard=hard)


def box(sx: float, sy: float, sz: float, mat: str, center=(0.0, 0.0, 0.0), hard: bool = True) -> Geo:
    g = Geo()
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    cx, cy, cz = center
    idx = [g.v((cx + x, cy + y, cz + z)) for x in (-hx, hx) for y in (-hy, hy) for z in (-hz, hz)]
    # index = x*4 + y*2 + z
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    for q in quads:
        g.f(tuple(idx[i] for i in q), mat, None, hard)
    return g


def sphere(r: float, seg: int, rings: int, mat: str, hard: bool = False) -> Geo:
    prof = [(r * math.sin(math.pi * i / rings), -r * math.cos(math.pi * i / rings)) for i in range(rings + 1)]
    prof[0] = (0.0, -r)
    prof[-1] = (0.0, r)
    return lathe(prof, seg, mat, hard=hard)


def extrude(
    outline: Sequence[tuple[float, float]],
    depth: float,
    mat: str,
    holes: Sequence[Sequence[tuple[float, float]]] = (),
    hard: bool = True,
    cap_mat: str | None = None,
    z0: float = 0.0,
) -> Geo:
    """Extrude a 2D outline (local XY) along +Z from z0 to z0+depth, caps triangulated (CDT)."""
    g = Geo()
    outline = ccw(outline)
    holes = [cw(h) for h in holes]
    loops = [outline] + list(holes)
    coords: list[tuple[float, float]] = []
    faces_in = []
    for lp in loops:
        start = len(coords)
        coords.extend(lp)
        faces_in.append(list(range(start, start + len(lp))))
    out = delaunay_2d_cdt(coords, [], faces_in, 3, 1e-7)
    vcos, _edges, tris = out[0], out[1], out[2]
    cm = cap_mat or mat
    bottom = [g.v((c[0], c[1], z0)) for c in vcos]
    top = [g.v((c[0], c[1], z0 + depth)) for c in vcos]
    for t in tris:
        if len(t) < 3:
            continue
        a, b, c = t[0], t[1], t[2]
        # CDT returns CCW triangles in XY; top faces +Z, bottom reversed
        g.f((top[a], top[b], top[c]), cm, None, hard)
        g.f((bottom[c], bottom[b], bottom[a]), cm, None, hard)
    # side walls: rebuild ring indices from original loop coords
    def find(co):
        best, bi = 1e9, 0
        for i, vc in enumerate(vcos):
            d = (vc[0] - co[0]) ** 2 + (vc[1] - co[1]) ** 2
            if d < best:
                best, bi = d, i
        return bi

    for lp in loops:
        ids = [find(p) for p in lp]
        n = len(ids)
        for i in range(n):
            a, b = ids[i], ids[(i + 1) % n]
            g.f((bottom[a], bottom[b], top[b], top[a]), mat, None, hard)
    return g


def sweep(
    path: Sequence,
    profile: Sequence[tuple[float, float]],
    mat: str,
    closed_path: bool = False,
    closed_profile: bool = True,
    caps: bool = True,
    hard: bool = False,
    scales: Sequence[float] | None = None,
    up_hint=None,
    uv_around: float = 1.0,
    uv_along: float = 1.0,
    cap_cdt: bool = False,
) -> Geo:
    """Sweep a 2D profile (normal, binormal) along a 3D path with rotation-minimising frames."""
    g = Geo()
    P = [Vector(p) for p in path]
    F = frames(P, closed=closed_path, up_hint=Vector(up_hint) if up_hint is not None else None)
    m = len(profile)
    lens = path_length(P)
    rings = []
    for i, (p, (t, nrm, bin_)) in enumerate(zip(P, F)):
        s = scales[i] if scales is not None else 1.0
        rings.append([g.v(p + nrm * (px * s) + bin_ * (py * s)) for px, py in profile])
    n = len(P)
    seg_count = n if closed_path else n - 1
    pm = m if closed_profile else m - 1
    for i in range(seg_count):
        A, B = rings[i], rings[(i + 1) % n]
        v0 = lens[i] * uv_along
        v1 = (lens[i + 1] if i + 1 < n else lens[-1] + (P[0] - P[-1]).length) * uv_along
        for j in range(pm):
            j1 = (j + 1) % m
            u0, u1 = j / m * uv_around, (j + 1) / m * uv_around
            g.f((A[j], A[j1], B[j1], B[j]), mat, ((u0, v0), (u1, v0), (u1, v1), (u0, v1)), hard)
    if caps and not closed_path and closed_profile:
        if cap_cdt:
            prof2 = [tuple(p) for p in profile]
            flip = polygon_area(prof2) < 0
            out = delaunay_2d_cdt(prof2, [], [list(range(m))], 3, 1e-9)
            vco, tris, orig = out[0], out[2], out[3]
            # map CDT output verts back to profile indices (CDT keeps input verts first)
            idx_map = []
            for k, o in enumerate(orig):
                idx_map.append(o[0] if o else None)
            for t in tris:
                a, b, c = (idx_map[i] for i in t[:3])
                if a is None or b is None or c is None:
                    continue
                if not flip:
                    g.f((rings[0][c], rings[0][b], rings[0][a]), mat, None, True)
                    g.f((rings[-1][a], rings[-1][b], rings[-1][c]), mat, None, True)
                else:
                    g.f((rings[0][a], rings[0][b], rings[0][c]), mat, None, True)
                    g.f((rings[-1][c], rings[-1][b], rings[-1][a]), mat, None, True)
        else:
            c0 = g.v(sum((g.verts[i] for i in rings[0]), Vector()) / m)
            c1 = g.v(sum((g.verts[i] for i in rings[-1]), Vector()) / m)
            for j in range(m):
                j1 = (j + 1) % m
                g.f((c0, rings[0][j1], rings[0][j]), mat, None, True)
                g.f((c1, rings[-1][j], rings[-1][j1]), mat, None, True)
    return g


def tube(path: Sequence, r: float, sides: int, mat: str, **kw) -> Geo:
    prof = [(r * math.cos(TAU * i / sides), r * math.sin(TAU * i / sides)) for i in range(sides)]
    return sweep(path, prof, mat, **kw)


def helix_path(radius: float, pitch: float, turns: float, samples_per_turn: int = 32, y0: float = 0.0, close_ends: float = 0.0) -> list[Vector]:
    """Coil spring centre line along +Y; `close_ends` turns at each end with zero pitch (ground ends)."""
    pts = []
    total = turns + 2 * close_ends
    n = int(total * samples_per_turn)
    y = y0
    for i in range(n + 1):
        t = i / samples_per_turn
        a = TAU * t
        if t < close_ends or t > total - close_ends:
            dy = 0.15 * pitch / samples_per_turn
        else:
            dy = pitch / samples_per_turn
        if i > 0:
            y += dy
        pts.append(Vector((radius * math.cos(a), y, -radius * math.sin(a))))
    return pts


def radial(g: Geo, count: int, axis: str = "y", phase: float = 0.0) -> Geo:
    out = Geo()
    ax = {"x": "X", "y": "Y", "z": "Z"}[axis]
    for i in range(count):
        out.extend(g, Matrix.Rotation(math.radians(phase) + TAU * i / count, 4, ax))
    return out


def plate(outline: Sequence[tuple[float, float]], thickness: float, mat: str, plane: str = "xy", holes=(), hard: bool = True) -> Geo:
    """Extruded 2D plate centred on its thickness, oriented so the outline lies in `plane`."""
    g = extrude(outline, thickness, mat, holes=holes, hard=hard, z0=-thickness / 2)
    if plane == "xy":
        return g
    if plane == "zy":  # outline x -> vehicle z, outline y -> y, thickness along x
        return g.transform(R("y", -90))
    if plane == "xz":  # outline in horizontal plane, thickness along y
        return g.transform(R("x", -90))
    raise ValueError(plane)


def grid_surface(rows: Sequence[Sequence], mat: str, hard: bool = False, closed_u: bool = False, uv_scale: float = 1.0) -> Geo:
    """Quad surface through a grid of points rows[i][j] (i along v, j along u)."""
    g = Geo()
    idx = [[g.v(p) for p in row] for row in rows]
    nv = len(idx)
    nu = len(idx[0])
    for i in range(nv - 1):
        for j in range(nu if closed_u else nu - 1):
            j1 = (j + 1) % nu
            g.f((idx[i][j], idx[i][j1], idx[i + 1][j1], idx[i + 1][j]), mat,
                ((j * uv_scale, i * uv_scale), ((j + 1) * uv_scale, i * uv_scale), ((j + 1) * uv_scale, (i + 1) * uv_scale), (j * uv_scale, (i + 1) * uv_scale)), hard)
    return g


def loft(sections: Sequence[Sequence], mat: str, closed: bool = True, caps: bool = True, hard: bool = False) -> Geo:
    """Loft through closed (or open) sections with equal point counts; optional flat caps."""
    g = Geo()
    idx = [[g.v(p) for p in sec] for sec in sections]
    m = len(idx[0])
    pm = m if closed else m - 1
    for i in range(len(idx) - 1):
        A, B = idx[i], idx[i + 1]
        for j in range(pm):
            j1 = (j + 1) % m
            g.f((A[j], A[j1], B[j1], B[j]), mat, None, hard)
    if caps and closed:
        for ring, rev in ((idx[0], True), (idx[-1], False)):
            c = g.v(sum((g.verts[i] for i in ring), Vector()) / m)
            for j in range(m):
                j1 = (j + 1) % m
                if rev:
                    g.f((c, ring[j1], ring[j]), mat, None, True)
                else:
                    g.f((c, ring[j], ring[j1]), mat, None, True)
    return g


def rounded_box(sx: float, sy: float, sz: float, r: float, mat: str, n: int = 3, center=(0.0, 0.0, 0.0), hard: bool = False) -> Geo:
    """Box with rounded vertical edges (outline rounded in XZ, extruded along Y)."""
    outline = rounded_rect(sx, sz, r, n)
    g = extrude(outline, sy, mat, hard=True, z0=-sy / 2)
    # extrude builds in XY with depth along Z -> rotate so depth is along vehicle Y
    g.transform(R("x", -90))
    g.transform(T(*center))
    if not hard:
        pass
    return g


def superellipse2d(a: float, b: float, n_exp: float, samples: int) -> list[tuple[float, float]]:
    pts = []
    for i in range(samples):
        t = TAU * i / samples
        c, s = math.cos(t), math.sin(t)
        x = a * math.copysign(abs(c) ** (2 / n_exp), c)
        y = b * math.copysign(abs(s) ** (2 / n_exp), s)
        pts.append((x, y))
    return pts


def belt_path(circles: Sequence[tuple[float, float, float]], samples_per_rad: float = 10.0) -> list[tuple[float, float]]:
    """Closed 2D path wrapping circles (cx, cy, r) given in CCW order around the loop (outer tangents)."""
    n = len(circles)
    tangents = []
    for i in range(n):
        (x1, y1, r1), (x2, y2, r2) = circles[i], circles[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        d = math.hypot(dx, dy)
        a = math.atan2(dy, dx)
        b = math.asin(max(-1.0, min(1.0, (r1 - r2) / d)))
        ang = a - math.pi / 2 + b  # right-hand (outer) normal for a CCW loop
        p1 = (x1 + r1 * math.cos(ang), y1 + r1 * math.sin(ang))
        p2 = (x2 + r2 * math.cos(ang), y2 + r2 * math.sin(ang))
        tangents.append((p1, p2, ang))
    pts: list[tuple[float, float]] = []
    for i in range(n):
        p1, p2, ang_out = tangents[i]
        nxt = tangents[(i + 1) % n]
        pts.append(p1)
        pts.append(p2)
        # arc on circle i+1 from ang_out to the next tangent's start angle (going CW for outer side)
        cx, cy, r = circles[(i + 1) % n]
        a0 = ang_out
        a1 = nxt[2]
        da = a1 - a0
        while da <= 0:
            da += 2 * math.pi
        while da > 2 * math.pi:
            da -= 2 * math.pi
        steps = max(2, int(abs(da) * samples_per_rad) + 2)
        for k in range(1, steps):
            t = a0 + da * k / steps
            pts.append((cx + r * math.cos(t), cy + r * math.sin(t)))
    return pts
