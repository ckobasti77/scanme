"""Scena: putanje, prostor vozila, kolekcije, imena i pomoćne oznake.

Prostor vozila = glTF prostor (x = levo, y = gore, z = napred, metri). Blender je Z-gore sa
prednjim krajem ka -Y, pa V(x, y, z) -> Blender (x, -z, y). Sve skripte misle u prostoru vozila
i konvertuju samo ovde (docs/auto3d/planovi/A01.md §4.1).
"""

from __future__ import annotations

import hashlib
import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]  # koren repoa
OUT = ROOT / "output" / "auto3d"
PUBLIC = ROOT / "public" / "3d" / "auto3d"
RENDERS = OUT / "renders"

ROOT_NAME = "limuzina"
EXPORT_COLL = "EXPORT"
HELPER_COLL = "HELPERS"
HELPER_PREFIX = "a3_"  # pomoćne oznake, brišu se pre izvoza


def V(x: float, y: float, z: float) -> Vector:
    """Prostor vozila (levo, gore, napred) -> Blender."""
    return Vector((x, -z, y))


def to_vehicle(v) -> tuple[float, float, float]:
    """Blender -> prostor vozila (levo, gore, napred)."""
    return (v[0], v[2], -v[1])


def check_version() -> None:
    if bpy.app.version < (5, 1, 0):
        raise RuntimeError(f"Potreban je Blender >= 5.1, a pokrenut je {bpy.app.version_string}")


def log(*args) -> None:
    print("[auto3d]", *args, flush=True)


def reset_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.images, bpy.data.node_groups):
        for item in list(coll):
            coll.remove(item)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.unit_settings.scale_length = 1.0


def get_collection(name: str) -> bpy.types.Collection:
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def export_collection() -> bpy.types.Collection:
    return get_collection(EXPORT_COLL)


def helper_collection() -> bpy.types.Collection:
    return get_collection(HELPER_COLL)


def new_empty(name: str, location=(0, 0, 0), parent=None) -> bpy.types.Object:
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, None)
        export_collection().objects.link(obj)
    obj.empty_display_type = "PLAIN_AXES"
    obj.empty_display_size = 0.05
    obj.location = location
    if parent is not None:
        obj.parent = parent
    return obj


def root() -> bpy.types.Object:
    return new_empty(ROOT_NAME)


def delete_tree(obj: bpy.types.Object) -> None:
    for child in list(obj.children):
        delete_tree(child)
    data = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if isinstance(data, bpy.types.Mesh) and data.users == 0:
        bpy.data.meshes.remove(data)


def delete_by_system(systems: set[str]) -> int:
    """Briše sve čvorove (part__ i deco__) zadatih sistema."""
    victims = [o for o in bpy.data.objects if o.get("a3_system") in systems]
    for o in victims:
        if o.name in bpy.data.objects:
            delete_tree(o)
    return len(victims)


def rot_yaw180() -> tuple[float, float, float]:
    """Rotacija čvora za 180° oko ose vozila gore (Blender Z)."""
    return (0.0, 0.0, math.pi)


def scripts_hash() -> str:
    h = hashlib.sha256()
    base = ROOT / "3d" / "auto3d"
    files = sorted(p for p in base.rglob("*.py") if "__pycache__" not in p.parts)
    files.append(ROOT / "lib" / "auto3d" / "catalog.ts")
    for p in files:
        h.update(str(p.relative_to(ROOT)).replace("\\", "/").encode())
        h.update(p.read_bytes())
    return h.hexdigest()


VEH_TO_BL = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
