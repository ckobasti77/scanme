"""Detalji karoserije i svetla (A07): maska (body/grille.py), retrovizori (body/mirrors.py) i
svetla (body/lights.py). Kvake, usisnici, spliter, difuzor i brisači su u body/trim.py i ulaze u
panele u body/shell.py.
"""

from __future__ import annotations

from body import grille, lights, mirrors


def build(ctx, only=None) -> None:
    lite = ctx.lite
    if only is None or "karoserija" in only:
        ctx.add_part("maska", "", grille.grille(lite), cap=2)
        ml = mirrors.mirror_left(lite)
        ctx.add_part("retrovizor", "l", ml)
        ctx.add_part("retrovizor", "d", ml.mirrored_x())
    if only is None or "elektrika" in only:
        lights.build(ctx, only)
