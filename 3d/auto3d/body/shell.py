"""Karoserija: paneli iz kaveza, stakla, skelet, pod, obloge lukova (A01 §1.4–1.6)."""

from __future__ import annotations

import json
import math

import bmesh
import bpy
from mathutils import Vector

from config import body as B
from config import dims as D
from body import openings, trim
from lib import cage, parts, scene
from lib.geo import Geo, box, extrude, lathe, rounded_rect, sweep

PAINT = "mat_body_paint"
BLACK = "mat_trim_black"
PLASTIC = "mat_plastic"
GLASS = "mat_glass"
CARBON = "mat_carbon"

GAP_EDGES: dict[str, list] = {}  # spoljne ivice panela za merenje fuga (measure.py)

# panel kaveza -> (deo, materijal)
PANEL_PART = {
    "hauba": "hauba",
    "blatobran": "blatobran",
    "vrata_prednja": "vrata_prednja",
    "vrata_zadnja": "vrata_zadnja",
    "prag": "prag",
    "poklopac_prtljaznika": "poklopac_prtljaznika",
    "branik_prednji": "branik_prednji",
    "branik_zadnji": "branik_zadnji",
}


def _side_keep(pid: int, left: bool):
    def keep(f, pan):
        if f[pan] != pid:
            return False
        x = scene.to_vehicle(f.calc_center_median())[0]
        return x > 0 if left else x < 0

    return keep


def _id_keep(*pids: int):
    s = set(pids)
    return lambda f, pan: f[pan] in s


def _bbox_center(obj: bpy.types.Object) -> Vector:
    pts = [Vector(scene.to_vehicle(v.co)) for v in obj.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return (mn + mx) / 2


def _panel(ctx, bm_full, keep, part_id: str, instance: str, mats: list[str], mat_index=None, extra: list | None = None):
    bm = cage.extract(bm_full, keep)
    if not bm.faces:
        bm.free()
        raise RuntimeError(f"panel {part_id} {instance}: nema lica")
    GAP_EDGES[parts.node_name(part_id, instance)] = cage.finish_panel(bm)
    obj = cage.to_object(f"a3_{part_id}_{instance}", bm, mats, mat_index)
    bm.free()
    if not ctx.lite:
        cage.hem_bevel(obj, B.HEM_BEVEL)
    else:
        obj.data.set_sharp_from_angle(angle=math.radians(55))  # prirubnica ne sme da zatamni ivicu (A06)
    for other in extra or []:
        _join(obj, other)
    return ctx.add_part_object(part_id, instance, obj, _bbox_center(obj))


def _join(dst: bpy.types.Object, src: bpy.types.Object) -> None:
    """Spaja mesh src u dst (oba u Blender prostoru, bez transformacija), čuva materijale po imenu."""
    bm = bmesh.new()
    bm.from_mesh(dst.data)
    offset = len(dst.data.materials)
    names = [m.name for m in dst.data.materials]
    remap = []
    for m in src.data.materials:
        if m.name in names:
            remap.append(names.index(m.name))
        else:
            dst.data.materials.append(m)
            names.append(m.name)
            remap.append(len(names) - 1)
    tmp = bmesh.new()
    tmp.from_mesh(src.data)
    for f in tmp.faces:
        f.material_index = remap[f.material_index] if remap else 0
    me_tmp = bpy.data.meshes.new("a3_tmp")
    tmp.to_mesh(me_tmp)
    tmp.free()
    bm.from_mesh(me_tmp)
    bm.to_mesh(dst.data)
    bm.free()
    bpy.data.meshes.remove(me_tmp)
    bpy.data.objects.remove(src, do_unlink=True)
    _ = offset


def _geo_object(geo: Geo, name: str) -> bpy.types.Object:
    """Geo (prostor vozila) -> pomoćni objekat u Blender prostoru, za spajanje u panel."""
    obj = bpy.data.objects.new(name, geo.to_mesh(name))
    scene.helper_collection().objects.link(obj)
    return obj


def _glass(bm_full, keep, name: str, inset: float = B.GLASS_INSET, thick: float = B.GLASS_T) -> bpy.types.Object:
    bm = cage.extract(bm_full, keep)
    cage.offset_shell(bm, inset, thick)
    obj = cage.to_object(name, bm, [GLASS])
    bm.free()
    return obj


# --------------------------------------------------------------------------- neklikabilno


def floor_geo(lite: bool) -> Geo:
    """Pod (deco__karoserija__pod). A08: prati mehaniku (config/hardpoints.py): prednji pod sa kanalom
    izduva desno, tunel (širok napred za menjač i prenosnu kutiju, uzak u kabini), protivpožarni
    zid sa prolazom tunela i kanala, zid ispod prednje ivice zadnjeg sedišta, pod ispod sedišta sa
    servisnim otvorom iznad pumpe goriva, pod iznad zadnje osovine sa kosim prelazom i pod prtljažnika."""
    from config import hardpoints as H

    g = Geo()
    m = "mat_paint_black"
    t, fy = H.FLOOR_T, H.FLOOR_Y
    cx_in, cx_out, cz0, cz1, cy = H.EXHAUST_CHANNEL
    rr = 0.030
    n_arc = 2 if lite else 4

    def tunnel_section(z):
        wb, wt, yt = H.tunnel_at(z)
        yb_r = cy if z >= cz0 - 1e-6 else fy  # desni zid staje na krov kanala izduva
        outer = [(wb, fy), (wt, yt - rr)]
        outer += [(wt - rr + rr * math.cos(math.pi / 2 * k / n_arc), yt - rr + rr * math.sin(math.pi / 2 * k / n_arc)) for k in range(1, n_arc + 1)]
        outer += [(-x, y) for x, y in reversed(outer[2:])] + [(-wt, yt - rr), (-wb, yb_r)]
        inner = [(x - t if x > 0 else x + t, y - t) for x, y in outer]
        inner[0] = (wb - t, fy - t)
        inner[-1] = (-wb + t, yb_r - t)
        return outer + [(-wb, yb_r - t)] + list(reversed(inner)) + [(wb, fy - t)]

    zs = [z for z, *_ in H.TUNNEL]
    stations = sorted({round(z, 4) for z in zs + [cz0, cz0 - 0.002, 0.0]}, reverse=True)
    rows = [[Vector((x, y, z)) for x, y in tunnel_section(z)] for z in stations]
    from lib.geo import loft

    g += loft(rows, m, closed=True, caps=False, hard=False)
    # prednji pod levo (unutrašnja ivica prati donju ivicu tunela)
    zl = [z for z in stations if H.KICK_Z[1] <= z <= 0.815]
    left = [(0.86, 0.815)] + [(H.tunnel_at(z)[0], z) for z in zl] + [(H.tunnel_at(H.KICK_Z[1])[0], H.KICK_Z[1]), (0.86, H.KICK_Z[1])]
    g += _floor_plate(left, fy - t, t, m)
    right = [(-0.86, 0.815), (cx_out, 0.815), (cx_out, cz0), (-H.tunnel_at(cz0)[0], cz0)] + [(-H.tunnel_at(z)[0], z) for z in zl if z < cz0] + [(-H.tunnel_at(H.KICK_Z[1])[0], H.KICK_Z[1]), (-0.86, H.KICK_Z[1])]
    g += _floor_plate(right, fy - t, t, m)
    # kanal izduva: krov, spoljni i zadnji zid
    roof = [(cx_out, 0.815), (cx_out, cz0)] + [(-H.tunnel_at(z)[0], z) for z in stations if cz0 <= z <= 0.815][::-1]
    g += _floor_plate(roof, cy, t, m)
    g += box(t, cy + t - 0.270, 0.815 - cz0, m, center=(cx_out - t / 2, (cy + t + 0.270) / 2, (0.815 + cz0) / 2))  # spoljni zid kanala (katalizatori izlaze ispod)
    g += box(-cx_out - H.tunnel_at(cz0)[0], cy + t - fy, t, m, center=((cx_out - H.tunnel_at(cz0)[0]) / 2, (cy + t + fy) / 2, cz0 - t / 2))
    # protivpožarni zid sa prolazom tunela i kanala
    wb, wt, yt = H.tunnel_at(0.815)
    sec = tunnel_section(0.815)
    tun = sec[: (len(sec) - 2) // 2]  # spoljna ivica tunela: od levog dna (+x) preko vrha do desnog (-x)
    wall = [(0.74, fy - t), (0.74, 0.860), (-0.74, 0.860), (-0.74, fy - t), (cx_out - t, fy - t), (cx_out - t, cy + t)] + [(x, y) for x, y in reversed(tun)] + [(wb, fy - t)]
    fw = extrude(wall, 0.020, m, hard=True, z0=0.800)
    g += fw
    # zid ispod prednje ivice zadnjeg sedišta (sa prolazom tunela)
    wbk, wtk, ytk = H.tunnel_at(H.KICK_Z[0])
    px = H.REAR_PAN_X
    kick = [(px, fy - t), (px, H.REAR_PAN_Y), (-px, H.REAR_PAN_Y), (-px, fy - t), (-wbk, fy - t), (-wbk, ytk), (wbk, ytk), (wbk, fy - t)]
    kg = extrude(kick, H.KICK_Z[1] - H.KICK_Z[0], m, hard=True, z0=0.0)
    g += kg.moved(0.0, 0.0, H.KICK_Z[0])
    # pod ispod zadnjeg sedišta sa servisnim otvorom iznad pumpe goriva (A01 §2.4)
    seg = 16 if lite else 32
    hole = [(0.320 + 0.080 * math.cos(2 * math.pi * k / seg), -0.860 + 0.080 * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    pan = [(px, H.KICK_Z[1]), (-px, H.KICK_Z[1]), (-px, -1.080), (-0.600, -1.130), (-0.600, -1.250), (0.600, -1.250), (0.600, -1.130), (px, -1.080)]  # uz zadnje točkove
    g += _floor_plate(pan, H.REAR_PAN_Y - t, t, m, holes=[hole])
    # pod iznad zadnje osovine, kosi prelaz i pod prtljažnika
    ay, ax, az0, az1 = H.AXLE_FLOOR
    g += _floor_plate([(ax, az0), (-ax, az0), (-ax, az1), (ax, az1)], ay, t, m)
    g += box(2 * ax, ay + t - (H.REAR_PAN_Y - t), t, m, center=(0.0, (ay + t + H.REAR_PAN_Y - t) / 2, az0 + t / 2))
    ty, tx, tz0, tz1 = H.TRUNK
    slope = [Vector((x, y, z)) for x, y, z in ((ax, ay, az1), (-ax, ay, az1), (-ax, ty, tz0), (ax, ty, tz0))]
    sg = Geo()
    ids = [sg.v(p) for p in slope] + [sg.v(p + Vector((0, t, 0))) for p in slope]
    for f in ((0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        sg.f(tuple(ids[i] for i in f), m, None, True)
    g += sg
    g += _floor_plate([(tx, tz0), (-tx, tz0), (-tx, tz1), (tx, tz1)], ty, t, m)
    return g


def _floor_plate(outline_xz, y0: float, t: float, mat: str, holes=()) -> Geo:
    """Ploča poda: obris u ravni (x, z), debljina t od y0 naviše."""
    from mathutils import Matrix

    g = extrude([(x, -z) for x, z in outline_xz], t, mat, holes=[[(x, -z) for x, z in h] for h in holes], hard=True, z0=0.0)
    # (a, b, d) = (x, -z, y) -> (x, y0 + d, z)
    return g.transform(Matrix(((1, 0, 0, 0), (0, 0, 1, y0), (0, -1, 0, 0), (0, 0, 0, 1))))


def arch_liners(lite: bool) -> Geo:
    g = Geo()
    seg = 18 if lite else 32
    for zc, yc, r in cage.ARCHES:
        rr = r + 0.012
        for s in (1, -1):
            pts = []
            for k in range(seg + 1):
                a = math.radians(-112 + 224 * k / seg)
                pts.append(Vector((0.0, yc + rr * math.cos(a), zc + rr * math.sin(a))))
            prof = [(0.0, 0.0), (0.0, 0.0)]
            _ = prof
            # traka od x 0.60 do 0.90 duž luka
            rows = []
            for x in (0.56, 0.925):
                rows.append([Vector((s * x, p.y, p.z)) for p in pts])
            gg = Geo()
            idx = [[gg.v(p) for p in r_] for r_ in rows]
            for k in range(seg):
                if s > 0:
                    gg.f((idx[0][k], idx[0][k + 1], idx[1][k + 1], idx[1][k]), PLASTIC, None, False)
                else:
                    gg.f((idx[0][k], idx[1][k], idx[1][k + 1], idx[0][k + 1]), PLASTIC, None, False)
            g += gg
    return g


# --------------------------------------------------------------------------- build


def build(ctx, only=None) -> None:
    body = cage.subdivided_body(ctx.quality)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bpy.data.objects.remove(body, do_unlink=True)
    cage.cut_arches(bm)
    cage.flare_arches(bm)
    pid = cage.PID
    # A07: otvori farova, LED traka, stop svetala i usisnika (glatka ivica, pre podele na panele)
    stats = openings.cut(bm, openings.define(bm, pid), refine=openings.REFINE[ctx.quality])
    openings.STATE["quality"] = ctx.quality
    scene.log(f"otvori (obrisano, poravnato): {stats}")
    # A09: temena bez lica (ostaju posle sečenja otvora uz ivicu maske) bi ušla u svaki panel i staklo
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    tree = openings.STATE["surf"].tree
    bm.faces.ensure_lookup_table()

    # stakla (pre panela, iz istih lica)
    ws = _glass(bm, _id_keep(pid["vetrobran"]), "a3_ws", thick=0.005)
    ctx.add_part_object("vetrobran", "", ws, _bbox_center(ws))
    rg = _glass(bm, _id_keep(pid["zadnje_staklo"]), "a3_rg")
    ctx.add_part_object("zadnje_staklo", "", rg, _bbox_center(rg))
    for inst, left in (("l", True), ("d", False)):
        sg = _glass(bm, _side_keep(pid["dlo"], left), f"a3_side_{inst}")
        ctx.add_part_object("bocna_stakla", inst, sg, _bbox_center(sg))

    # bočni paneli; vrata nose donju traku okvira stakla (traka kaveza 7, sjajno crno) i kvaku
    for inst, left in (("l", True), ("d", False)):
        _panel(ctx, bm, _side_keep(pid["blatobran"], left), "blatobran", inst, [PAINT])
    for name in ("vrata_prednja", "vrata_zadnja"):
        hl = trim.handle_left(tree, name, ctx.lite)
        for inst, left in (("l", True), ("d", False)):
            h = _geo_object(hl if left else hl.mirrored_x(), f"a3_kvaka_{name}_{inst}")
            _panel(ctx, bm, _side_keep(pid[name], left), PANEL_PART[name], inst, [PAINT, BLACK],
                   lambda p, band: 1 if band == 7 else 0, extra=[h])
    for inst, left in (("l", True), ("d", False)):
        def prag_mat(p, band, _l=left):
            return 1 if scene.to_vehicle(p.center)[1] < 0.185 else 0

        _panel(ctx, bm, _side_keep(pid["prag"], left), "prag", inst, [PAINT, BLACK], prag_mat)

    # paneli preko sredine
    for name in ("hauba", "poklopac_prtljaznika"):
        _panel(ctx, bm, _id_keep(pid[name]), name, "", [PAINT])

    def bumper_mat(p, band):
        return 1 if band == 0 else 0  # spliter: podvijena donja traka

    front_extra = trim.intakes(openings.STATE["surf"], ctx.lite)
    front_extra += trim.splitter(tree, ctx.lite)
    _panel(ctx, bm, _id_keep(pid["branik_prednji"]), "branik_prednji", "", [PAINT, CARBON], bumper_mat,
           extra=[_geo_object(front_extra, "a3_branik_napred_dodaci")])

    def rear_bumper_mat(p, band):
        return 1 if band <= 1 else 0  # difuzor: trake ispod linije praga (tuck..sill)

    _panel(ctx, bm, _id_keep(pid["branik_zadnji"]), "branik_zadnji", "", [PAINT, CARBON], rear_bumper_mat,
           extra=[_geo_object(trim.diffuser(ctx.lite), "a3_difuzor"),
                  _geo_object(trim.plate_recess(openings.STATE["surf"], "rear", ctx.lite), "a3_tablica")])

    # krov: okvir + panoramsko staklo
    pano = _glass(bm, _id_keep(pid["krov_staklo"]), "a3_pano", inset=0.006)
    _panel(ctx, bm, _id_keep(pid["krov"]), "krov", "", [PAINT], extra=[pano])

    # skelet: bokovi, stubovi, krovni nosači, auspuh panel; crni B-stub
    def skelet_mat(p, _bm=bm):
        return 0

    skel_bm = cage.extract(bm, _id_keep(pid["skelet"], pid["skelet_crno"], pid["okvir"]))
    pan = skel_bm.faces.layers.int.get("panel")
    for f in skel_bm.faces:
        f.material_index = 1 if f[pan] in (pid["skelet_crno"], pid["okvir"]) else 0
    GAP_EDGES[parts.node_name("skelet", "")] = cage.finish_panel(skel_bm)
    skel = cage.to_object("a3_skelet", skel_bm, [PAINT, BLACK])
    # finish_panel gubi material_index samo na prirubnici (nasleđuje susedno lice), pa je u redu
    skel_bm.free()
    if not ctx.lite:
        cage.hem_bevel(skel, B.HEM_BEVEL)
    else:
        skel.data.set_sharp_from_angle(angle=math.radians(55))
    ctx.add_part_object("skelet", "", skel, _bbox_center(skel))
    _ = skelet_mat
    bm.free()

    if not ctx.lite:
        (scene.OUT / "gap_edges.json").write_text(json.dumps({k: [[round(c, 5) for c in p] for p in v] for k, v in GAP_EDGES.items()}),
                                                  encoding="utf-8")

    # neklikabilno
    ctx.add_deco("deco__karoserija__pod", floor_geo(ctx.lite))
    ctx.add_deco("deco__karoserija__obloge_lukova", arch_liners(ctx.lite))
    ctx.add_deco("deco__karoserija__brisaci", trim.wipers(tree, ctx.lite))
