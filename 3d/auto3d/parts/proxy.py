"""Rezerva: kutija za čvor koji nijedan builder nije napravio (vidi se u logu kao PROXY).

Izvoz odbija scenu sa proxy čvorom (oznaka a3_proxy), da proxy nikad ne uđe u GLB.
"""

from __future__ import annotations

from config.hardpoints import HARD
from lib.geo import box


def build_one(ctx, node: str) -> None:
    parts_ = node.split("__")
    part_id = parts_[2]
    inst = parts_[3] if len(parts_) > 3 else ""
    center, size = HARD.get(part_id, ((0.0, 0.5, 0.0), (0.1, 0.1, 0.1)))
    x, y, z = center
    if inst == "d":
        x = -x
    obj = ctx.add_part(part_id, inst, box(*size, "mat_plastic", center=(x, y, z)))
    obj["a3_proxy"] = 1
