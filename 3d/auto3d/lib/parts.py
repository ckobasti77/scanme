"""Katalog, imena čvorova, extras i kontekst gradnje.

Svaki klikabilni deo je JEDAN mesh objekat `part__<sistem>__<deo>[__<inst>]` (list, bez dece):
ishodište = pivot, rotacija jedinična (osim yaw 180° za desne felne, gume i diskove), skala 1.
Geometrija se zadaje u apsolutnom prostoru vozila (Geo) i pomera za pivot (A01 §4.1).
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field

import bmesh
import bpy
from mathutils import Vector

from config.explode import explode_for
from . import scene
from .finish import finish_object
from .geo import Geo
from .materials import FAMILY

CATALOG_JSON = scene.OUT / "catalog.json"
PIVOTS_JSON = scene.OUT / "pivots.json"
_CATALOG: dict | None = None
_PIVOTS: dict | None = None


def catalog() -> dict:
    global _CATALOG
    if _CATALOG is None:
        if not CATALOG_JSON.exists():
            raise FileNotFoundError(f"{CATALOG_JSON} ne postoji: pokreni `node 3d/auto3d/catalog-json.mjs`")
        _CATALOG = json.loads(CATALOG_JSON.read_text(encoding="utf-8"))
    return _CATALOG


def part_def(part_id: str) -> dict:
    for p in catalog()["parts"]:
        if p["id"] == part_id:
            return p
    raise KeyError(f"deo {part_id} nije u katalogu")


def node_name(part_id: str, instance: str = "") -> str:
    p = part_def(part_id)
    if instance and instance not in p["instances"]:
        raise KeyError(f"{part_id}: instanca {instance} nije u katalogu")
    if not instance and p["instances"]:
        raise KeyError(f"{part_id}: potrebna je instanca {p['instances']}")
    return f"part__{p['system']}__{part_id}" + (f"__{instance}" if instance else "")


def expected_nodes() -> list[str]:
    return [n for p in catalog()["parts"] for n in p["nodes"]]


def desktop_pivots() -> dict:
    global _PIVOTS
    if _PIVOTS is None:
        _PIVOTS = json.loads(PIVOTS_JSON.read_text(encoding="utf-8")) if PIVOTS_JSON.exists() else {}
    return _PIVOTS


def write_pivots() -> None:
    data = {o.name: [round(c, 6) for c in scene.to_vehicle(o.matrix_world.translation)] for o in part_objects()}
    PIVOTS_JSON.write_text(json.dumps(data, indent=1), encoding="utf-8")


def part_objects() -> list[bpy.types.Object]:
    return sorted((o for o in bpy.data.objects if o.name.startswith("part__")), key=lambda o: o.name)


def lite_merge(mats: list[str], cap: int) -> list[str]:
    """Spaja materijale dela na najviše `cap` slotova, unutar iste porodice kad može."""
    counts: dict[str, int] = {}
    for m in mats:
        counts[m] = counts.get(m, 0) + 1
    if len(counts) <= cap:
        return mats
    order = sorted(counts, key=lambda m: -counts[m])
    keep = order[:cap]
    if cap >= 3:  # svetla zadržavaju sočivo, izvor svetla i kućište
        want = [m for m in order if FAMILY.get(m) in ("see", "light")]
        keep = list(dict.fromkeys(want + order))[:cap]
    remap = {}
    for m in counts:
        if m in keep:
            continue
        same = [k for k in keep if FAMILY.get(k) == FAMILY.get(m)]
        remap[m] = same[0] if same else keep[0]
    return [remap.get(m, m) for m in mats]


def _tag(obj: bpy.types.Object, system: str, builder: str, quality: str) -> None:
    obj["a3_system"] = system
    obj["a3_builder"] = builder
    obj["a3_quality"] = quality


@dataclass
class BuildContext:
    quality: str = "desktop"
    module: str = ""
    shared: dict = field(default_factory=dict)
    built: set = field(default_factory=set)

    @property
    def lite(self) -> bool:
        return self.quality == "lite"

    def seg(self, n: int, minimum: int = 8) -> int:
        return max(minimum, int(round(n * (0.5 if self.lite else 1.0))))

    def _pivot(self, node: str, pivot) -> Vector:
        if self.lite and node in desktop_pivots():
            return Vector(desktop_pivots()[node])
        return Vector(pivot)

    def _write_extras(self, obj: bpy.types.Object, part_id: str, instance: str) -> None:
        p = part_def(part_id)
        d, dist, stage = explode_for(part_id, instance)
        v = Vector(d)
        v = v.normalized() if v.length > 1e-9 else Vector((0, 1, 0))
        obj["part_id"] = part_id
        obj["system"] = p["system"]
        obj["instance"] = instance
        obj["explode_dir"] = [round(v.x, 5), round(v.y, 5), round(v.z, 5)]
        obj["explode_dist"] = float(dist)
        obj["explode_stage"] = int(stage)

    def add_part(
        self,
        part_id: str,
        instance: str,
        geo_abs: Geo | None,
        *,
        pivot=None,
        bevel: float = 0.0,
        segments: int = 2,
        sharp_angle: float = 30.0,
        cap: int | None = None,
        share_from: str | None = None,
        yaw180: bool = False,
    ) -> bpy.types.Object:
        """Deo iz apsolutne geometrije (prostor vozila). pivot = centar bbox-a ako nije zadat.

        share_from: ime čvora čiju mrežu deli (desna felna/guma/disk), uz yaw180 i pivot.
        """
        node = node_name(part_id, instance)
        old = bpy.data.objects.get(node)
        if old is not None:
            scene.delete_tree(old)
        coll = scene.export_collection()
        if share_from:
            src = bpy.data.objects[share_from]
            obj = bpy.data.objects.new(node, src.data)
        else:
            if geo_abs is None or not geo_abs.faces:
                raise ValueError(f"{node}: nema geometrije")
            if pivot is None:
                mn, mx = geo_abs.bbox()
                pivot = (mn + mx) / 2
            p = self._pivot(node, pivot)
            g = geo_abs.copy().moved(-p.x, -p.y, -p.z)
            limit = cap if cap is not None else (2 if self.lite else 3)
            g.mats = lite_merge(g.mats, limit)
            mesh = g.to_mesh(node, sharp_angle=sharp_angle)
            obj = bpy.data.objects.new(node, mesh)
            pivot = p
        coll.objects.link(obj)
        obj.parent = scene.root()
        obj.location = scene.V(*Vector(pivot))
        obj.rotation_mode = "XYZ"
        obj.rotation_euler = scene.rot_yaw180() if yaw180 else (0.0, 0.0, 0.0)
        if not share_from:
            finish_object(obj, bevel=bevel, segments=segments)
        self._write_extras(obj, part_id, instance)
        _tag(obj, part_def(part_id)["system"], self.module, self.quality)
        self.built.add(node)
        return obj

    def add_part_object(self, part_id: str, instance: str, obj: bpy.types.Object, pivot) -> bpy.types.Object:
        """Deo iz gotovog mesh objekta u Blender prostoru (karoserija): ishodište se pomera na pivot."""
        node = node_name(part_id, instance)
        old = bpy.data.objects.get(node)
        if old is not None and old != obj:
            scene.delete_tree(old)
        p = self._pivot(node, pivot)
        pb = scene.V(*p)
        obj.data.transform(__import__("mathutils").Matrix.Translation(-pb))
        obj.location = pb
        obj.name = node
        obj.data.name = node
        for c in obj.users_collection:
            c.objects.unlink(obj)
        scene.export_collection().objects.link(obj)
        obj.parent = scene.root()
        self._write_extras(obj, part_id, instance)
        _tag(obj, part_def(part_id)["system"], self.module, self.quality)
        self.built.add(node)
        return obj

    def add_deco(self, name: str, geo_abs: Geo | None = None, obj: bpy.types.Object | None = None) -> bpy.types.Object:
        system = name.split("__")[1]
        old = bpy.data.objects.get(name)
        if old is not None and old != obj:
            scene.delete_tree(old)
        if obj is None:
            assert geo_abs is not None
            geo_abs = geo_abs.copy()
            geo_abs.mats = lite_merge(geo_abs.mats, 2 if self.lite else 3)
            mesh = geo_abs.to_mesh(name)
            obj = bpy.data.objects.new(name, mesh)
            scene.export_collection().objects.link(obj)
            finish_object(obj, bevel=0.0)
        else:
            obj.name = name
            obj.data.name = name
            for c in obj.users_collection:
                c.objects.unlink(obj)
            scene.export_collection().objects.link(obj)
        obj.parent = scene.root()
        _tag(obj, system, self.module, self.quality)
        self.built.add(name)
        return obj


def triangle_count(obj: bpy.types.Object) -> int:
    me = obj.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def mesh_from_bmesh(name: str, bm: bmesh.types.BMesh) -> bpy.types.Object:
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    obj = bpy.data.objects.new(name, me)
    scene.helper_collection().objects.link(obj)
    return obj


def deg(a: float) -> float:
    return math.radians(a)
