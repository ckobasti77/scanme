"""Biblioteka PBR materijala. Imena slotova su deo ugovora (A01 §3.3).

Boje su sRGB heks i ovde se pretvaraju u linearne. Samo ravne Principled vrednosti, bez tekstura.
"""

from __future__ import annotations

import bpy


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i : i + 2], 16) / 255.0) for i in (0, 2, 4))  # type: ignore[return-value]


# ime: (heks, metal, hrapavost, dvostran, dodatno)
LIBRARY: dict[str, tuple[str, float, float, bool, dict]] = {
    "mat_body_paint": ("#2B2F33", 0.6, 0.30, True, {"coat": (1.0, 0.05), "xray": "body"}),
    "mat_trim_black": ("#0B0C0E", 0.0, 0.18, True, {"coat": (0.6, 0.05)}),
    "mat_carbon": ("#16181B", 0.2, 0.28, True, {"coat": (0.8, 0.05)}),
    "mat_plastic": ("#141517", 0.0, 0.65, True, {}),
    "mat_plastic_light": ("#CFCAC0", 0.0, 0.45, False, {}),
    "mat_glass": ("#1C2327", 0.0, 0.02, True, {"alpha": 0.55, "xray": "glass"}),  # A09: zatamnjeno (0,35 je izgledalo kao maketa); rendgen ga ne koristi
    "mat_lens": ("#E8EEF2", 0.0, 0.02, True, {"alpha": 0.12, "xray": "glass"}),  # A07: 0,18 -> 0,12 (sočivo sa dva lica je bilo mlečno)
    "mat_chrome": ("#E3E6E9", 1.0, 0.06, True, {}),
    "mat_alu": ("#A9ADB2", 1.0, 0.38, False, {}),
    "mat_steel": ("#8E949A", 1.0, 0.32, False, {}),
    "mat_cast": ("#4A4D50", 1.0, 0.70, False, {}),
    "mat_paint_black": ("#1A1C1F", 0.3, 0.45, False, {}),
    "mat_heat_shield": ("#9EA2A6", 1.0, 0.50, False, {}),
    "mat_rubber": ("#151617", 0.0, 0.62, False, {}),  # A07: satenska guma (napomena nadzora 17. 10. 01:40)
    "mat_tire": ("#161718", 0.0, 0.92, False, {}),
    "mat_wheel": ("#4A4F56", 0.80, 0.28, False, {"coat": (0.5, 0.1)}),  # A07: tamni grafit, svetliji od gume da se felna čita
    "mat_brake_disc": ("#7A7E82", 1.0, 0.42, False, {}),
    "mat_caliper": ("#9C7A4A", 0.6, 0.35, False, {}),
    "mat_leather": ("#6B4330", 0.0, 0.55, False, {}),
    "mat_screen": ("#05070A", 0.0, 0.05, False, {"emission": ("#0E2A3A", 0.6)}),
    "mat_led": ("#F2F6FF", 0.0, 0.30, False, {"emission": ("#F2F6FF", 4.0)}),
    "mat_led_red": ("#3A0508", 0.0, 0.35, False, {"emission": ("#FF1A2A", 2.5)}),
    "mat_fins": ("#3B3F44", 0.6, 0.55, False, {}),
}

# porodice za spajanje materijala u lite modelu (A01 §3.3)
FAMILY = {
    **{m: "metal" for m in ("mat_alu", "mat_steel", "mat_cast", "mat_chrome", "mat_heat_shield", "mat_brake_disc", "mat_caliper", "mat_fins", "mat_wheel")},
    **{m: "dark" for m in ("mat_plastic", "mat_rubber", "mat_tire", "mat_paint_black", "mat_trim_black", "mat_carbon", "mat_screen", "mat_leather", "mat_plastic_light")},
    **{m: "see" for m in ("mat_glass", "mat_lens")},
    **{m: "light" for m in ("mat_led", "mat_led_red")},
    "mat_body_paint": "paint",
}


def _principled(mat: bpy.types.Material):
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (400, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return bsdf


def build_library() -> dict[str, bpy.types.Material]:
    mats = {}
    for name, (hx, metal, rough, double, extra) in LIBRARY.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        bsdf = _principled(mat)
        r, g, b = hex_rgb(hx)
        bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
        bsdf.inputs["Metallic"].default_value = metal
        bsdf.inputs["Roughness"].default_value = rough
        if "coat" in extra:
            w, cr = extra["coat"]
            bsdf.inputs["Coat Weight"].default_value = w
            bsdf.inputs["Coat Roughness"].default_value = cr
        if "emission" in extra:
            ehx, strength = extra["emission"]
            bsdf.inputs["Emission Color"].default_value = (*hex_rgb(ehx), 1.0)
            bsdf.inputs["Emission Strength"].default_value = strength
        if "alpha" in extra:
            bsdf.inputs["Alpha"].default_value = extra["alpha"]
            mat.surface_render_method = "BLENDED"
        # A02: svi materijali su dvostrani (otvorene ljuske i lathe profili bez provere orijentacije)
        mat.use_backface_culling = False
        _ = double
        mat.diffuse_color = (r, g, b, 1.0)
        mat.metallic = metal
        mat.roughness = rough
        mats[name] = mat
    return mats


def manifest_materials(used: set[str]) -> list[dict]:
    out = []
    for name in LIBRARY:
        if name not in used:
            continue
        entry: dict = {"name": name}
        if "xray" in LIBRARY[name][4]:
            entry["xray"] = LIBRARY[name][4]["xray"]
        out.append(entry)
    return out
