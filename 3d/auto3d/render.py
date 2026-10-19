"""QA renderi (A01 §3.5).

  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/render.py -- \
      --set qa --modes lak,rendgen --views side,front34,rear34,front,top,xray34 --tag A02
  ... -- --set closeup --focus kocnice --tag A07/k2        (sistem ili id dela)
  ... -- --set closeup --focus napred,pozadi,tocak,bok --tag A07/k1   (krupni kadrovi, CLOSEUPS)
  ... -- --set qa --modes kostur --views front34,side,under --tag A08/k1   (A08: PBR bez karoserije)
  ... -- --set qa --modes zebra --views front34,side --tag A09/z   (A09: pruge refleksije za talase lima)

Izlaz: output/auto3d/renders/<tag>/<režim>-<pogled>.png
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import parts as P  # noqa: E402
from lib import scene  # noqa: E402
from lib import views  # noqa: E402

VIEWS = {
    "front34": (35.0, 12.0),
    "rear34": (215.0, 12.0),
    "xray34": (35.0, 18.0),
    "exploded34": (38.0, 22.0),
    "kostur34": (35.0, 22.0),
    "under": (35.0, -12.0),
}


# krupni kadrovi (A07): delovi koji određuju kadar, az, el, samo leva instanca
CLOSEUPS = {
    "napred": (["branik_prednji", "maska", "far", "led_traka_prednja"], 24.0, 5.0, False),
    "pozadi": (["branik_zadnji", "stop_svetlo", "led_traka_zadnja", "poklopac_prtljaznika"], 206.0, 7.0, False),
    "tocak": (["felna_prednja", "guma_prednja"], 72.0, 3.0, True),
    "bok": (["vrata_prednja", "vrata_zadnja", "retrovizor", "bocna_stakla"], 62.0, 8.0, True),
}


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default="qa", choices=["qa", "closeup"])
    ap.add_argument("--modes", default="lak,rendgen")
    ap.add_argument("--views", default="side,front34,rear34,front,top,xray34")
    ap.add_argument("--focus", default="")
    ap.add_argument("--az", type=float, default=None)
    ap.add_argument("--el", type=float, default=None)
    ap.add_argument("--p", type=float, default=0.0)
    ap.add_argument("--solo", action="store_true", help="krupni kadar: sakrij sve osim fokusa")
    ap.add_argument("--tag", default="qa")
    ap.add_argument("--res", default="1600x1000")
    ap.add_argument("--samples", type=int, default=32)
    return ap.parse_args(argv)


def body_node(o) -> bool:
    return o.name.split("__")[1] == "karoserija"


def set_visible(pred) -> None:
    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith(("part__", "deco__")):
            o.hide_render = not pred(o)


def ortho(name: str, pts, axis: str, w: int, h: int):
    mn, mx = views.bbox(pts)
    c = (mn + mx) / 2
    aspect = w / h
    if axis == "side":
        pos = Vector((c.x + 10, c.y, c.z))
        span_w, span_h = mx.z - mn.z, mx.y - mn.y
    elif axis == "top":
        pos = Vector((c.x, c.y + 10, c.z + 0.0001))
        span_w, span_h = mx.z - mn.z, mx.x - mn.x
    elif axis == "back":
        pos = Vector((c.x, c.y, c.z - 10))
        span_w, span_h = mx.x - mn.x, mx.y - mn.y
    else:
        pos = Vector((c.x, c.y, c.z + 10))
        span_w, span_h = mx.x - mn.x, mx.y - mn.y
    cam = views.make_camera(name, pos, c, 30, ortho_scale=max(span_w, span_h * aspect) * 1.08)
    cam.data.sensor_fit = "HORIZONTAL"
    if axis == "top":
        import math
        from mathutils import Euler

        cam.rotation_mode = "XYZ"
        cam.rotation_euler = Euler((0.0, 0.0, math.radians(90.0)))
    return cam


def render(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene.render.filepath = str(path)
    t = time.time()
    bpy.ops.render.render(write_still=True)
    scene.log(f"render {path.name} ({time.time() - t:.1f} s)")


def rig() -> None:
    views.setup_world(0.6)
    views.add_sun("a3h_under", "#DDE8F0", 1.6, 30, -40, shadow=False)  # A08: odozdo, samo kad je pod skriven
    views.add_sun("a3h_key", "#FFF4E8", 2.2, 35, 45, shadow=True)
    views.add_sun("a3h_rim", "#CFEFFF", 1.0, 200, 25, shadow=False)
    views.add_strip("a3h_strip_l", 400.0, 0.45, 3.2)
    views.add_strip("a3h_strip_r", 300.0, -0.6, 3.4)
    views.color_management()


def main() -> None:
    args = parse()
    w, h = (int(v) for v in args.res.split("x"))
    views.eevee(args.samples)
    rig()
    fl = views.floor()
    out = scene.RENDERS / args.tag
    ex = views.Exploder()
    if args.set == "qa":
        for mode in [m for m in args.modes.split(",") if m]:
            if mode == "rendgen":
                views.apply_xray()
            elif mode == "zebra":
                views.apply_zebra()
            else:
                views.apply_lacquer()
            for view in [v for v in args.views.split(",") if v]:
                exploded = view == "exploded34"
                ex.apply(1.0 if exploded else args.p)
                no_body = view == "kostur34" or mode == "kostur"
                set_visible(lambda o: not (no_body and body_node(o)))
                no_floor = view == "under" or exploded  # A08: rasklopljeni delovi idu i ispod nivoa poda
                fl.hide_render = no_floor
                bpy.data.objects["a3h_under"].hide_render = not no_floor
                views.set_output(w, h)
                pts = views.scene_points()
                if view in ("side", "top", "front", "back"):
                    ortho("a3h_cam", pts, view, w, h)
                else:
                    az, el = VIEWS[view]
                    box = (0.05, 0.95, 0.08, 0.92) if exploded else (0.08, 0.92, 0.14, 0.86)
                    pos, tgt = views.solve_camera(pts, az, el, 28.0, w / h, box=box)
                    views.make_camera("a3h_cam", pos, tgt, 28.0)
                render(out / f"{mode}-{view}.png")
            ex.reset()
            set_visible(lambda o: True)
    else:
        cat = P.catalog()
        systems = {s["id"] for s in cat["systems"]}
        for focus in [f for f in args.focus.split(",") if f]:
            az, el, left_only = args.az if args.az is not None else 35.0, args.el if args.el is not None else 20.0, False
            ids = [focus]
            if focus in CLOSEUPS:
                ids, az0, el0, left_only = CLOSEUPS[focus]
                az = args.az if args.az is not None else az0
                el = args.el if args.el is not None else el0
            names = [n for p in cat["parts"] for n in p["nodes"] if p["id"] in ids or (focus in systems and p["system"] == focus)]
            if left_only:
                names = [n for n in names if not n.endswith("__d")]
            objs = [bpy.data.objects[n] for n in names if n in bpy.data.objects]
            if not objs:
                raise SystemExit(f"nema delova za fokus {focus}")
            for mode in [m for m in args.modes.split(",") if m]:
                views.apply_xray() if mode == "rendgen" else views.apply_zebra() if mode == "zebra" else views.apply_lacquer()
                vis = {o.name for o in objs}
                set_visible(lambda o: (o.name in vis) if args.solo else not (mode == "kostur" and body_node(o)))
                fl.hide_render = el < -2
                bpy.data.objects["a3h_under"].hide_render = el >= -2
                ex.apply(args.p)
                pts = views.scene_points(objs)
                views.set_output(w, h)
                pos, tgt = views.solve_camera(pts, az, el, 30.0, w / h, box=(0.12, 0.88, 0.14, 0.86))
                views.make_camera("a3h_cam", pos, tgt, 30.0)
                suffix = f"-{args.az:g}-{args.el:g}" if args.az is not None and focus not in CLOSEUPS else ""
                render(out / f"{mode}-closeup-{focus}{suffix}{'-solo' if args.solo else ''}.png")


main()
