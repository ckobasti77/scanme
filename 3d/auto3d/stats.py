"""Trouglovi i materijali po čvoru .blend fajla (najveći prvo).

  node 3d/auto3d/blender.mjs --blend output/auto3d/limuzina.blend 3d/auto3d/stats.py [-- filter]
"""

import sys

sys.dont_write_bytecode = True

import bpy  # noqa: E402

rows = []
total = 0
draws = 0
for o in sorted(bpy.data.objects, key=lambda o: o.name):
    if o.type != "MESH" or not o.name.startswith(("part__", "deco__")):
        continue
    me = o.data
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    used = len({p.material_index for p in me.polygons})
    total += n
    draws += used
    rows.append((n, used, o.name))
flt = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1 else ""
for n, used, name in sorted(rows, reverse=True):
    if flt and flt not in name:
        continue
    print(f"STAT {n:7d}  materijala {used}  {name}")
print(f"STAT ukupno {total} trouglova, {draws} draw call-ova, {len(rows)} čvorova")
