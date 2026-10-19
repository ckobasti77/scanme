"""Kamere, svetla, svet, izgled rendgena i laka, rasklapanje (port reference, nova imena)."""

from __future__ import annotations

import math

import bpy
from mathutils import Vector

from config.xray import BACKGROUND, XRAY
from . import parts as P
from . import scene
from .materials import hex_rgb
from .scene import V, to_vehicle

STUDIO_EXR = "studiolights/world/studio.exr"


# --------------------------------------------------------------------------- geometrija scene


def node_points(obj: bpy.types.Object) -> list[Vector]:
    mw = obj.matrix_world
    return [Vector(to_vehicle(mw @ v.co)) for v in obj.data.vertices]


def bbox(points) -> tuple[Vector, Vector]:
    if not points:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    mn = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    mx = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    return mn, mx


def corners(mn: Vector, mx: Vector) -> list[Vector]:
    return [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]


def scene_points(objs=None) -> list[Vector]:
    pts: list[Vector] = []
    objs = objs if objs is not None else [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(("part__", "deco__")) and not o.hide_render]
    for o in objs:
        mn, mx = bbox([Vector(to_vehicle(o.matrix_world @ Vector(c))) for c in o.bound_box])
        pts.extend(corners(mn, mx))
    return pts


def cam_dir(az_deg: float, el_deg: float) -> Vector:
    """Jedinični vektor od mete ka kameri. az: 0 = spreda (+z), 90 = sleva (+x)."""
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)))


def project(points, pos: Vector, target: Vector, fov_deg: float, aspect: float):
    f = (target - pos).normalized()
    r = f.cross(Vector((0, 1, 0))).normalized()
    u = r.cross(f)
    t = math.tan(math.radians(fov_deg) / 2)
    out = []
    for p in points:
        v = p - pos
        z = max(v.dot(f), 1e-4)
        out.append(((v.dot(r) / (z * t * aspect) + 1) / 2, (1 - v.dot(u) / (z * t)) / 2))
    return out


def solve_camera(points, az, el, fov, aspect, *, box=None, width=None, cx=0.5, cy=0.5, iters=60):
    """Pozicija i meta kamere tako da projekcija tačaka popuni okvir ili širinu oko centra."""
    d = cam_dir(az, el)
    mn, mx = bbox(points)
    target = (mn + mx) / 2
    dist = (mx - mn).length * 2.5
    fwd = -d
    right = fwd.cross(Vector((0, 1, 0))).normalized()
    up = right.cross(fwd)
    for _ in range(iters):
        pos = target + d * dist
        s = project(points, pos, target, fov, aspect)
        x0, x1 = min(p[0] for p in s), max(p[0] for p in s)
        y0, y1 = min(p[1] for p in s), max(p[1] for p in s)
        if box is not None:
            bx0, bx1, by0, by1 = box
            scale = max((x1 - x0) / (bx1 - bx0), (y1 - y0) / (by1 - by0))
            tcx, tcy = (bx0 + bx1) / 2, (by0 + by1) / 2
        else:
            scale = (x1 - x0) / width
            tcx, tcy = cx, cy
        dist *= scale ** 0.9
        half_w = dist * math.tan(math.radians(fov) / 2) * aspect
        half_h = dist * math.tan(math.radians(fov) / 2)
        target = target + right * (((x0 + x1) / 2 - tcx) * 2 * half_w * 0.8) + up * (-((y0 + y1) / 2 - tcy) * 2 * half_h * 0.8)
    return target + d * dist, target


def make_camera(name: str, pos: Vector, target: Vector, fov_deg: float, ortho_scale: float | None = None) -> bpy.types.Object:
    data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, data)
        scene.helper_collection().objects.link(cam)
    data.sensor_fit = "VERTICAL"
    data.clip_start = 0.05
    data.clip_end = 200
    if ortho_scale:
        data.type = "ORTHO"
        data.ortho_scale = ortho_scale
    else:
        data.type = "PERSP"
        data.angle_y = math.radians(fov_deg)
    p, t = V(*pos), V(*target)
    cam.location = p
    cam.rotation_mode = "QUATERNION"
    cam.rotation_quaternion = (t - p).to_track_quat("-Z", "Y")
    bpy.context.scene.camera = cam
    return cam


# --------------------------------------------------------------------------- svet i svetla


def setup_world(strength: float = 0.6) -> None:
    w = bpy.data.worlds.get("auto3d_world") or bpy.data.worlds.new("auto3d_world")
    bpy.context.scene.world = w
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    tex = nt.nodes.new("ShaderNodeTexEnvironment")
    import os

    exr = os.path.join(bpy.utils.system_resource("DATAFILES"), *STUDIO_EXR.split("/"))
    tex.image = bpy.data.images.load(exr, check_existing=True)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    nt.links.new(tex.outputs["Color"], bg.inputs["Color"])
    lp = nt.nodes.new("ShaderNodeLightPath")
    flat = nt.nodes.new("ShaderNodeBackground")
    flat.inputs["Color"].default_value = (*hex_rgb(BACKGROUND), 1)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(bg.outputs["Background"], mix.inputs[1])
    nt.links.new(flat.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])


def add_sun(name: str, hexcol: str, strength: float, az: float, el: float, shadow: bool = True, angle_deg: float = 6.0):
    data = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
    data.color = hex_rgb(hexcol)
    data.energy = strength
    data.use_shadow = shadow
    data.angle = math.radians(angle_deg)
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, data)
        scene.helper_collection().objects.link(obj)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = (-V(*cam_dir(az, el))).to_track_quat("-Z", "Y")
    return obj


def add_strip(name: str, power: float, x: float, y: float, size=(0.25, 6.0)) -> None:
    """Uska area traka iznad auta duž z: linije refleksije na laku."""
    data = bpy.data.lights.get(name) or bpy.data.lights.new(name, "AREA")
    data.shape = "RECTANGLE"
    data.size, data.size_y = size
    data.energy = power
    obj = bpy.data.objects.get(name)
    if obj is None:
        obj = bpy.data.objects.new(name, data)
        scene.helper_collection().objects.link(obj)
    obj.location = V(x, y, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)


def floor(size: float = 30.0) -> bpy.types.Object:
    me = bpy.data.meshes.get("a3h_floor")
    if me is None:
        s = size / 2
        me = bpy.data.meshes.new("a3h_floor")
        me.from_pydata([(-s, -s, 0), (s, -s, 0), (s, s, 0), (-s, s, 0)], [], [(0, 1, 2, 3)])
        mat = bpy.data.materials.new("a3h_floor_mat")
        nt = mat.node_tree
        b = nt.nodes.get("Principled BSDF")
        b.inputs["Base Color"].default_value = (*hex_rgb(BACKGROUND), 1)
        b.inputs["Roughness"].default_value = 0.85
        me.materials.append(mat)
    obj = bpy.data.objects.get("a3h_floor") or bpy.data.objects.new("a3h_floor", me)
    if obj.name not in scene.helper_collection().objects:
        scene.helper_collection().objects.link(obj)
    return obj


def color_management() -> None:
    s = bpy.context.scene
    s.view_settings.view_transform = "Khronos PBR Neutral"
    s.view_settings.look = "None"
    s.view_settings.exposure = 0.0
    s.display_settings.display_device = "sRGB"


def eevee(samples: int = 32) -> None:
    s = bpy.context.scene
    s.render.engine = "BLENDER_EEVEE"
    s.eevee.taa_render_samples = samples
    s.eevee.use_raytracing = False
    s.eevee.use_shadows = True
    s.render.filter_size = 1.5


def set_output(w: int, h: int, transparent: bool = False) -> None:
    r = bpy.context.scene.render
    r.resolution_x, r.resolution_y = w, h
    r.resolution_percentage = 100
    r.film_transparent = transparent
    r.image_settings.file_format = "PNG"
    r.image_settings.color_mode = "RGBA" if transparent else "RGB"
    r.image_settings.color_depth = "8"


# --------------------------------------------------------------------------- materijali za render


def _clear(mat):
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return nt


def xray_material(mat: bpy.types.Material, v: dict) -> None:
    """Fresnel ivica u boji rima, providna sredina (isto značenje kao web šejder)."""
    nt = _clear(mat)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    dot = nt.nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    nt.links.new(geo.outputs["Normal"], dot.inputs[0])
    nt.links.new(geo.outputs["Incoming"], dot.inputs[1])
    ab = nt.nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    nt.links.new(dot.outputs["Value"], ab.inputs[0])
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 1.0
    nt.links.new(ab.outputs[0], inv.inputs[1])
    pw = nt.nodes.new("ShaderNodeMath")
    pw.operation = "POWER"
    pw.inputs[1].default_value = v["rimPower"]
    nt.links.new(inv.outputs[0], pw.inputs[0])
    col = nt.nodes.new("ShaderNodeMix")
    col.data_type = "RGBA"
    col.inputs["A"].default_value = (*hex_rgb(v["tint"]), 1)
    col.inputs["B"].default_value = (*hex_rgb(v["rim"]), 1)
    nt.links.new(pw.outputs[0], col.inputs["Factor"])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(col.outputs["Result"], em.inputs["Color"])
    al = nt.nodes.new("ShaderNodeMapRange")
    al.inputs["To Min"].default_value = v["baseAlpha"]
    al.inputs["To Max"].default_value = v["rimAlpha"]
    nt.links.new(pw.outputs[0], al.inputs["Value"])
    # A09: zadnja lica 0,7 kao na webu (uA3BackAlpha), da poster i canvas imaju istu gustinu ljuske
    back = nt.nodes.new("ShaderNodeMath")
    back.operation = "MULTIPLY_ADD"
    nt.links.new(geo.outputs["Backfacing"], back.inputs[0])
    back.inputs[1].default_value = -0.3
    back.inputs[2].default_value = 1.0
    alpha = nt.nodes.new("ShaderNodeMath")
    alpha.operation = "MULTIPLY"
    nt.links.new(al.outputs["Result"], alpha.inputs[0])
    nt.links.new(back.outputs[0], alpha.inputs[1])
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(alpha.outputs[0], mix.inputs["Fac"])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    mat.surface_render_method = "BLENDED"
    mat.use_backface_culling = False


def system_material(name: str, hexcol: str) -> bpy.types.Material:
    """Mehanika u rendgenu: boja sistema, mekano osvetljena, sa svetlijom ivicom."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = _clear(mat)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    c = hex_rgb(hexcol)
    b.inputs["Base Color"].default_value = (c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 1)
    b.inputs["Roughness"].default_value = 0.45
    b.inputs["Emission Color"].default_value = (*c, 1)
    b.inputs["Emission Strength"].default_value = 0.35
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    return mat


def paint_material(mat: bpy.types.Material, hexcol: str = "#7D858C") -> None:
    nt = _clear(mat)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*hex_rgb(hexcol), 1)
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["Roughness"].default_value = 0.22
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.03
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    mat.use_backface_culling = False


def apply_xray() -> None:
    """Karoserija (svi slotovi njenih delova) -> rendgen ljuska, stakla -> skoro nevidljiva, ostalo boje sistema."""
    cat = P.catalog()
    colors = {s["id"]: s["color"] for s in cat["systems"]}
    shell = bpy.data.materials.get("a3h_xray_body") or bpy.data.materials.new("a3h_xray_body")
    xray_material(shell, XRAY["body"])
    glass = bpy.data.materials.get("a3h_xray_glass") or bpy.data.materials.new("a3h_xray_glass")
    xray_material(glass, XRAY["glass"])
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.name.startswith(("part__", "deco__")):
            continue
        system = o.name.split("__")[1]
        if "a3_orig_mats" not in o:
            o["a3_orig_mats"] = [m.name if m else "" for m in o.data.materials]
        for i, m in enumerate(o.material_slots):
            orig = o["a3_orig_mats"][i]
            o.material_slots[i].link = "OBJECT"
            if system == "karoserija":
                o.material_slots[i].material = glass if orig in ("mat_glass", "mat_lens") else shell
            elif orig in ("mat_led", "mat_led_red", "mat_lens", "mat_glass") or (system == "kocnice" and orig == "mat_rubber"):
                # A07: gume ostaju tamna guma i u rendgenu (napomena nadzora), isto pravilo kao web
                o.material_slots[i].material = bpy.data.materials[orig]
            else:
                o.material_slots[i].material = system_material(f"a3h_sys_{system}", colors[system])
        _ = m


def apply_lacquer() -> None:
    """Lak za ocenu površina: srednje siv lak sa clearcoat-om na mat_body_paint."""
    for o in bpy.data.objects:
        if o.type == "MESH" and "a3_orig_mats" in o:
            for i, _ in enumerate(o.material_slots):
                o.material_slots[i].link = "OBJECT"
                o.material_slots[i].material = bpy.data.materials.get(o["a3_orig_mats"][i])
    lac = bpy.data.materials.get("a3h_lacquer") or bpy.data.materials.new("a3h_lacquer")
    paint_material(lac)
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.name.startswith(("part__", "deco__")):
            continue
        for i, slot in enumerate(o.material_slots):
            base = slot.material
            if base is not None and base.name == "mat_body_paint":
                slot.link = "OBJECT"
                slot.material = lac


def apply_zebra(freq: float = 36.0) -> None:
    """A09, samo QA: lak kao zebra (vodoravne pruge refleksije). Talas ili udubljenje lomi pruge,
    a glatka površina ih vodi u neprekidnim krivama."""
    apply_lacquer()
    mat = bpy.data.materials.get("a3h_zebra") or bpy.data.materials.new("a3h_zebra")
    nt = _clear(mat)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Reflection"], sep.inputs[0])
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = freq
    nt.links.new(sep.outputs["Z"], mul.inputs[0])
    sin = nt.nodes.new("ShaderNodeMath")
    sin.operation = "SINE"
    nt.links.new(mul.outputs[0], sin.inputs[0])
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = 0.0
    nt.links.new(sin.outputs[0], gt.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(gt.outputs[0], em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    for o in bpy.data.objects:
        if o.type != "MESH" or not o.name.startswith(("part__", "deco__")):
            continue
        for slot in o.material_slots:
            if slot.material is not None and slot.material.name == "a3h_lacquer":
                slot.material = mat


# --------------------------------------------------------------------------- rasklapanje


def cubic_in_out(t: float) -> float:
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


class Exploder:
    """Pomera delove u stanje rasklapanja p ∈ [0, 1] po prozorima faza (isto kao lib/auto3d/explode.ts)."""

    def __init__(self) -> None:
        self.windows = P.catalog()["explodeWindows"]
        self.home = {o.name: o.location.copy() for o in P.part_objects()}

    def offset(self, obj, p: float) -> Vector:
        s, e = self.windows[int(obj["explode_stage"])]
        t = min(max((p - s) / (e - s), 0.0), 1.0)
        d = Vector(obj["explode_dir"]) * float(obj["explode_dist"]) * cubic_in_out(t)
        return d

    def apply(self, p: float) -> None:
        for name, home in self.home.items():
            o = bpy.data.objects[name]
            o.location = home + V(*self.offset(o, p))
        bpy.context.view_layer.update()

    def reset(self) -> None:
        for name, home in self.home.items():
            bpy.data.objects[name].location = home
        bpy.context.view_layer.update()
