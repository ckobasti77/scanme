"""Turn a Geo into a finished mesh object: weight-limited bevel + weighted normals, applied.

Bevel runs only on edges that `Geo.to_mesh` marked with bevel weight 1 (sharp edges between
hard faces), so tubes, springs, belts and lathe fillets are never chamfered.
"""

from __future__ import annotations

import bpy

from .geo import Geo


def bake_modifiers(obj: bpy.types.Object) -> None:
    """Evaluate the modifier stack into a new mesh (custom normals kept), then clear modifiers."""
    if not obj.modifiers:
        return
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = obj.evaluated_get(dg)
    new = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    name = old.name
    obj.modifiers.clear()
    obj.data = new
    if old.users == 0:
        bpy.data.meshes.remove(old)
    new.name = name


def finish_object(
    obj: bpy.types.Object,
    bevel: float = 0.0012,
    segments: int = 2,
    profile: float = 0.5,
    weighted: bool = True,
) -> None:
    if bevel > 0:
        m = obj.modifiers.new("bevel", "BEVEL")
        m.width = bevel
        m.segments = segments
        m.limit_method = "WEIGHT"
        m.profile = profile
        m.use_clamp_overlap = True
        m.loop_slide = True
        m.harden_normals = True
        m.miter_outer = "MITER_ARC"
    if weighted:
        w = obj.modifiers.new("wnormal", "WEIGHTED_NORMAL")
        w.mode = "FACE_AREA"
        w.weight = 50
        w.keep_sharp = True
        w.thresh = 0.01
    bake_modifiers(obj)


def geo_to_object(
    geo: Geo,
    name: str,
    parent: bpy.types.Object | None,
    coll: bpy.types.Collection,
    bevel: float = 0.0012,
    segments: int = 2,
    profile: float = 0.5,
    sharp_angle: float = 30.0,
    weighted: bool = True,
) -> bpy.types.Object:
    mesh = geo.to_mesh(name, sharp_angle=sharp_angle)
    old = bpy.data.objects.get(name)
    if old is not None:
        bpy.data.objects.remove(old, do_unlink=True)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    finish_object(obj, bevel=bevel, segments=segments, profile=profile, weighted=weighted)
    return obj


def triangle_count(obj: bpy.types.Object) -> int:
    me = obj.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)
