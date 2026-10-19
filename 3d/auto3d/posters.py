"""Posteri i OG master iz kamera manifesta (A01 §3.7), izgled rendgena, EEVEE.

  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/posters.py -- --set all
  ... -- --only sklopljen-desktop

Izlaz: output/auto3d/posters/<ime>.png (RGBA: samo auto, providna pozadina) i cameras.json.
A09: pod, kontaktnu senku i pozadinu #0A0D11 dodaje `node 3d/auto3d/images.mjs`, istom formulom kao
pregledač (components/fair/auto3d/viewer/environment.ts): pod i pozadina u pregledaču ne prolaze kroz
tone mapping, pa bi ih Blender (Khronos PBR Neutral) potamneo i prelaz poster -> canvas bi skočio.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import json  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import scene, views  # noqa: E402

POSTERS = {
    "sklopljen-desktop": ("start", "desktop", 2560, 1440, 0.0),
    "rasklopljen-desktop": ("rasklopljen", "desktop", 2560, 1440, 1.0),
    "sklopljen-telefon": ("start", "telefon", 1080, 1350, 0.0),
    "rasklopljen-telefon": ("rasklopljen", "telefon", 1080, 1350, 1.0),
    "og": (None, None, 1200, 630, 0.0),
}

# OG: rendgen, az 30°, el 10°, auto u desnih ~62 % kadra, levo prostor za naslov (A01 §3.7)
OG_VIEW = {"az": 30.0, "el": 10.0, "fov": 26.0, "width": 0.56, "cx": 0.665, "cy": 0.56}


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", default="all")
    ap.add_argument("--only", default="")
    ap.add_argument("--samples", type=int, default=64)
    return ap.parse_args(argv)


def main() -> None:
    args = parse()
    cams = json.loads((scene.OUT / "manifest.base.json").read_text(encoding="utf-8"))["cameras"]
    views.eevee(args.samples)
    views.setup_world(0.6)
    views.add_sun("a3h_key", "#FFF4E8", 2.0, 35, 45, shadow=False)
    views.add_sun("a3h_rim", "#CFEFFF", 1.0, 200, 25, shadow=False)
    views.color_management()
    views.apply_xray()
    ex = views.Exploder()
    out = scene.OUT / "posters"
    out.mkdir(parents=True, exist_ok=True)
    cam_file = out / "cameras.json"
    used = json.loads(cam_file.read_text(encoding="utf-8")) if cam_file.exists() else {}
    wanted = [k for k in POSTERS if not args.only or k in args.only.split(",")]
    for key in wanted:
        state, vp, w, h, p = POSTERS[key]
        ex.apply(p)
        views.set_output(w, h, transparent=True)
        if state is None:
            pts = views.scene_points()
            o = OG_VIEW
            pos, tgt = views.solve_camera(pts, o["az"], o["el"], o["fov"], w / h, width=o["width"], cx=o["cx"], cy=o["cy"])
            fov = o["fov"]
        else:
            c = cams[state][vp]
            pos, tgt, fov = Vector(c["position"]), Vector(c["target"]), c["fov"]
        views.make_camera("a3h_cam", pos, tgt, fov)
        used[key] = {"position": [round(v, 5) for v in pos], "target": [round(v, 5) for v in tgt], "fov": fov, "width": w, "height": h}
        path = out / f"{key}.png"
        bpy.context.scene.render.filepath = str(path)
        t = time.time()
        bpy.ops.render.render(write_still=True)
        scene.log(f"poster {key} ({time.time() - t:.1f} s)")
    ex.reset()
    cam_file.write_text(json.dumps(used, indent=1), encoding="utf-8")


main()
