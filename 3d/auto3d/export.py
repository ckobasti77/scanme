"""Izvoz sirovog GLB-a i osnove manifesta iz scene (A01 §4).

  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/export.py -- --quality desktop
  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina-lite.blend 3d/auto3d/export.py -- --quality lite

Piše output/auto3d/limuzina[-lite].raw.glb i manifest.base.json (desktop) / manifest.lite.json (lite).
Pomoćne oznake (a3_*) se brišu samo u memoriji; .blend se ne čuva.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import json  # noqa: E402
import math  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from config import focus as F  # noqa: E402
from config.xray import BACKGROUND, XRAY  # noqa: E402
from lib import parts as P  # noqa: E402
from lib import scene, views  # noqa: E402
from lib.materials import manifest_materials  # noqa: E402

EXTRA_KEYS = ("part_id", "system", "instance", "explode_dir", "explode_dist", "explode_stage", "focus")

CAMERAS = {
    "start": {
        "desktop": {"az": 32.0, "el": 12.0, "fov": 28.0, "aspect": 16 / 9, "width": 0.80, "cx": 0.50, "cy": 0.56},
        "telefon": {"az": 28.0, "el": 16.0, "fov": 32.0, "aspect": 4 / 5, "width": 0.92, "cx": 0.50, "cy": 0.52},
        "kiosk": {"az": 36.0, "el": 10.0, "fov": 26.0, "aspect": 16 / 9, "width": 0.62, "cx": 0.44, "cy": 0.55},
    },
    "rasklopljen": {
        "desktop": {"az": 38.0, "el": 22.0, "fov": 30.0, "aspect": 16 / 9, "box": (0.06, 0.94, 0.08, 0.92)},
        "telefon": {"az": 30.0, "el": 24.0, "fov": 34.0, "aspect": 4 / 5, "box": (0.04, 0.96, 0.10, 0.90)},
        "kiosk": {"az": 38.0, "el": 22.0, "fov": 30.0, "aspect": 16 / 9, "box": (0.04, 0.80, 0.08, 0.92)},
    },
}


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", default="desktop", choices=["desktop", "lite"])
    return ap.parse_args(argv)


def r3(v) -> list[float]:
    return [round(float(v[0]), 4), round(float(v[1]), 4), round(float(v[2]), 4)]


def used_materials(obj: bpy.types.Object) -> list[str]:
    me = obj.data
    idx = {p.material_index for p in me.polygons}
    return sorted({me.materials[i].name for i in idx if i < len(me.materials) and me.materials[i]})


def focus_for(part_id: str, instance: str, mn: Vector, mx: Vector) -> dict:
    radius = max((mx - mn).length / 2, 0.05)
    o = F.OVERRIDES.get(part_id, {})
    az = o.get("az", F.DEFAULT_AZ)
    if instance == "d":
        az = -az
    return {
        "dist": round(float(o.get("dist", min(max(2.8 * radius, 0.9), 4.5))), 3),
        "az": round(float(az), 1),
        "el": round(float(o.get("el", F.DEFAULT_EL)), 1),
    }


def main() -> None:
    scene.check_version()
    args = parse()
    cat = P.catalog()
    expected = set(P.expected_nodes())
    present = {o.name for o in bpy.data.objects if o.name.startswith("part__")}
    if expected != present:
        raise RuntimeError(f"čvorovi ne odgovaraju katalogu: fale {sorted(expected - present)}, višak {sorted(present - expected)}")
    deco_present = {o.name for o in bpy.data.objects if o.name.startswith("deco__")}
    if deco_present != set(cat["deco"]):
        raise RuntimeError(f"deco čvorovi ne odgovaraju katalogu: {sorted(deco_present ^ set(cat['deco']))}")
    proxies = [o.name for o in bpy.data.objects if o.get("a3_proxy")]
    if proxies:
        raise RuntimeError(f"proxy čvorovi ne smeju u izvoz: {proxies}")
    bpy.context.view_layer.update()

    # --------------------------------------------------------------- po čvoru
    info: dict[str, dict] = {}
    for o in P.part_objects():
        pts = views.node_points(o)
        mn, mx = views.bbox(pts)
        inst = o["instance"]
        foc = focus_for(o["part_id"], inst, mn, mx)
        o["focus"] = foc
        info[o.name] = {
            "obj": o,
            "pivot": Vector(scene.to_vehicle(o.matrix_world.translation)),
            "center": (mn + mx) / 2,
            "size": mx - mn,
            "triangles": P.triangle_count(o),
            "materials": used_materials(o),
            "focus": foc,
        }
    deco = [o for o in bpy.data.objects if o.name.startswith("deco__")]
    car_pts = views.scene_points()
    car_mn, car_mx = views.bbox(car_pts)

    # --------------------------------------------------------------- kamere
    cams: dict = {}
    ex = views.Exploder()
    for state, per in CAMERAS.items():
        ex.apply(1.0 if state == "rasklopljen" else 0.0)
        pts = views.scene_points()
        cams[state] = {}
        for vp, c in per.items():
            if "box" in c:
                pos, tgt = views.solve_camera(pts, c["az"], c["el"], c["fov"], c["aspect"], box=c["box"])
            else:
                pos, tgt = views.solve_camera(pts, c["az"], c["el"], c["fov"], c["aspect"], width=c["width"], cx=c["cx"], cy=c["cy"])
            cams[state][vp] = {"position": r3(pos), "target": r3(tgt), "fov": c["fov"], "aspect": round(c["aspect"], 4)}
    ex.reset()

    # --------------------------------------------------------------- dimenzije (grubo; tačno meri measure.py)
    body = [o for o in bpy.data.objects if o.name.startswith(("part__karoserija", "part__elektrika")) and o.type == "MESH"]
    body_pts = [p for o in body for p in views.node_points(o)]
    no_mirror = [p for o in body if "retrovizor" not in o.name for p in views.node_points(o)]
    bmn, bmx = views.bbox(no_mirror)
    dims = {
        "length": round(bmx.z - bmn.z, 4),
        "width": round(2 * max(abs(bmn.x), abs(bmx.x)), 4),
        "widthMirrors": round(2 * max(abs(p.x) for p in body_pts), 4),
        "height": round(bmx.y, 4),
    }

    # --------------------------------------------------------------- manifest
    used: set[str] = set()
    parts_out = []
    for p in cat["parts"]:
        nodes = []
        mats: set[str] = set()
        tris = 0
        stage = None
        for name in p["nodes"]:
            i = info[name]
            o = i["obj"]
            mats.update(i["materials"])
            tris += i["triangles"]
            stage = int(o["explode_stage"])
            nodes.append({
                "name": name,
                "instance": o["instance"],
                "pivot": r3(i["pivot"]),
                "center": r3(i["center"]),
                "size": r3(i["size"]),
                "explode": {"dir": list(o["explode_dir"]), "dist": float(o["explode_dist"])},
                "focus": i["focus"],
            })
        used.update(mats)
        parts_out.append({
            "id": p["id"],
            "system": p["system"],
            "order": p["order"],
            "stage": stage,
            "primary": p["nodes"][0],
            "nodes": nodes,
            "materials": sorted(mats),
            "triangles": {args.quality: tris},
        })
    for o in deco:
        used.update(used_materials(o))
    draw_calls = sum(len(i["materials"]) for i in info.values()) + sum(len(used_materials(o)) for o in deco)
    triangles = sum(i["triangles"] for i in info.values()) + sum(P.triangle_count(o) for o in deco)
    manifest = {
        "schema": 1,
        "model": "limuzina",
        "generatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {"blender": bpy.app.version_string, "scriptsHash": scene.scripts_hash()},
        "units": "m",
        "axes": {"up": "+Y", "front": "+Z", "left": "+X"},
        "bbox": {"min": r3(car_mn), "max": r3(car_mx)},
        "dims": dims,
        "files": {},
        "look": {"background": BACKGROUND, "xray": XRAY},
        "explode": {"windows": cat["explodeWindows"], "easing": "cubicInOut"},
        "cameras": cams,
        "systems": [{"id": s["id"], "order": s["order"], "color": s["color"], "parts": [p["id"] for p in cat["parts"] if p["system"] == s["id"]]} for s in cat["systems"]],
        "parts": parts_out,
        "deco": [{"name": n, "system": n.split("__")[1]} for n in cat["deco"]],
        "materials": manifest_materials(used),
        "stats": {args.quality: {"triangles": triangles, "drawCalls": draw_calls, "nodes": len(info) + len(deco) + 1}},
    }

    # --------------------------------------------------------------- čišćenje i izvoz
    for o in bpy.data.objects:
        for key in list(o.keys()):
            if o.name.startswith("part__"):
                if key not in EXTRA_KEYS:
                    del o[key]
            else:
                del o[key]
        if o.type == "MESH":
            for key in list(o.data.keys()):
                del o.data[key]
    for m in bpy.data.materials:
        for key in list(m.keys()):
            del m[key]
    # Mreže dobijaju ime `m__<deo>[__inst]`: three.js GLTFLoader deli mrežu sa više materijala na
    # decu imenovanu po mreži, pa deca ne smeju da počinju sa `part__` (klikabilan je samo čvor).
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith(("part__", "deco__")) and not o.data.name.startswith("m__"):
            o.data.name = "m__" + o.name.split("__", 2)[2]
    for c in bpy.data.collections:
        if c.name != scene.EXPORT_COLL:
            for o in list(c.objects):
                bpy.data.objects.remove(o, do_unlink=True)
    coll = bpy.data.collections.get(scene.EXPORT_COLL)
    lc = bpy.context.view_layer.layer_collection.children[coll.name]
    bpy.context.view_layer.active_layer_collection = lc
    raw = scene.OUT / ("limuzina.raw.glb" if args.quality == "desktop" else "limuzina-lite.raw.glb")
    kwargs = dict(
        filepath=str(raw), export_format="GLB",
        use_active_collection=True, use_active_collection_with_nested=True, use_renderable=True,
        export_extras=True, export_yup=True, export_apply=True,
        export_normals=True, export_texcoords=False, export_tangents=False,
        export_materials="EXPORT", export_vertex_color="NONE", export_attributes=False,
        export_cameras=False, export_lights=False, export_animations=False, export_skins=False, export_morph=False,
        export_gpu_instances=False, export_hierarchy_flatten_objs=False,
        export_draco_mesh_compression_enable=False, export_use_gltfpack=False,
    )
    valid = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    missing = [k for k in kwargs if k not in valid]
    if missing:
        raise RuntimeError(f"glTF izvoznik nema argumente: {missing}")
    bpy.ops.export_scene.gltf(**kwargs)
    scene.log(f"izvezeno {raw} ({raw.stat().st_size / 1e6:.2f} MB, {triangles} trouglova, {draw_calls} draw call-ova)")
    out = scene.OUT / ("manifest.base.json" if args.quality == "desktop" else "manifest.lite.json")
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    scene.log(f"manifest: {out}")
    _ = math


main()
