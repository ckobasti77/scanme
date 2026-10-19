"""Gradi limuzinu (ili izabrane sisteme) i čuva .blend.

  node 3d/auto3d/blender.mjs 3d/auto3d/build.py -- [--quality desktop|lite] [--only karoserija,kocnice]

Bez --only scena se gradi od nule. Sa --only se otvara postojeći .blend, brišu se čvorovi tih
sistema i grade ponovo. Čvor koji nijedan builder ne napravi dobija proxy kutiju (PROXY u logu),
a izvoz tada pada, jer proxy ne sme u GLB.
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import argparse  # noqa: E402
import importlib  # noqa: E402
import time  # noqa: E402
from pathlib import Path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))

import bpy  # noqa: E402

from lib import parts as P  # noqa: E402
from lib import scene  # noqa: E402
from lib.materials import build_library  # noqa: E402

# builder -> sistemi koje pravi (redosled je važan: karoserija prva)
MODULES: list[tuple[str, set[str]]] = [
    ("body.shell", {"karoserija"}),
    ("body.details", {"karoserija", "elektrika"}),
    ("body.wheels", {"kocnice"}),
    ("parts.brakes", {"kocnice"}),
    ("parts.suspension", {"vesanje"}),
    ("parts.engine", {"motor"}),
    ("parts.intake_exhaust", {"usis_izduv"}),
    ("parts.cooling", {"hladjenje"}),
    ("parts.drivetrain", {"prenos"}),
    ("parts.energy", {"energija"}),
    ("parts.electrical", {"elektrika"}),
    ("parts.interior", {"enterijer"}),
]


def parse():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--quality", default="desktop", choices=["desktop", "lite"])
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default="")
    return ap.parse_args(argv)


def main() -> None:
    scene.check_version()
    args = parse()
    name = "limuzina.blend" if args.quality == "desktop" else "limuzina-lite.blend"
    out = Path(args.out) if args.out else scene.OUT / name
    only = {s for s in args.only.split(",") if s}
    t0 = time.time()
    if only and out.exists():
        bpy.ops.wm.open_mainfile(filepath=str(out))
        n = scene.delete_by_system(only)
        scene.log(f"obrisano {n} čvorova sistema {sorted(only)}")
        modules = [m for m, systems in MODULES if systems & only]
    else:
        scene.reset_scene()
        modules = [m for m, _ in MODULES]
    build_library()
    scene.root()
    ctx = P.BuildContext(quality=args.quality)
    for m in modules:
        ctx.module = m
        t = time.time()
        try:
            mod = importlib.import_module(m)
        except ModuleNotFoundError as e:
            if e.name == m:
                scene.log(f"modul {m}: još ne postoji")
                continue
            raise
        if only:
            mod.build(ctx, only)
        else:
            mod.build(ctx, None)
        scene.log(f"modul {m}: {time.time() - t:.1f} s")
    # proxy za čvorove koje niko nije napravio (vidljivo u logu; izvoz ih odbija)
    from parts import proxy

    missing = [n for n in P.expected_nodes() if bpy.data.objects.get(n) is None]
    for n in missing:
        scene.log(f"PROXY {n}")
        proxy.build_one(ctx, n)
    for o in list(bpy.data.objects):
        if o.name.startswith("a3_"):
            bpy.data.objects.remove(o, do_unlink=True)
    total = sum(P.triangle_count(o) for o in bpy.data.objects if o.type == "MESH" and o.name.startswith(("part__", "deco__")))
    scene.log(f"delova: {len(P.part_objects())} čvorova, trouglova: {total}")
    if args.quality == "desktop" and not only:
        bpy.context.view_layer.update()
        P.write_pivots()
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(out), compress=True)
    scene.log(f"sačuvano {out} za {time.time() - t0:.1f} s")


main()
