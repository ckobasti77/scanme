"""Svetla (A07): uski farovi sa unutrašnjošću, LED traka preko cele širine napred, stop svetla sa
3D strukturom i LED traka pozadi. Kućišta su sjajno crna (jedan materijal manje po svetlu: rendgen
na webu crta svaki slot karoserije dvaput, pa se pazi na broj draw call-ova).

Sve jedinice leže u otvorima iz body/openings.py: sočivo prati prvobitnu površinu karoserije
(uvučeno 3 mm, debljina 3 mm), a iza njega je kućište koje ide 40–90 mm unutra. LED linija je
neprekidna od ugla do ugla: u traci je na istoj visini kao gornja linija fara i stop svetla.
"""

from __future__ import annotations

import math

from mathutils import Vector

from body import openings as O
from lib.geo import Geo, lathe, rounded_rect, sweep

BLACK = "mat_trim_black"
LENS = "mat_lens"
LED = "mat_led"
LED_RED = "mat_led_red"
CHROME = "mat_chrome"
INSET = 0.001  # sočivo je 1 mm manje od otvora
MIN_H = 0.012  # spoljni kraj svetla: gde je otvor niži od 12 mm (uži deo se ne iseče čisto)


def outer_end(strip: O.Strip) -> float:
    u = strip.u1 - 0.008  # prirubnica granice sa haubom počinje odmah iza kraja otvora
    while u > strip.u0:
        lo, hi = strip.span(u)
        if hi - lo >= MIN_H:
            return u
        u -= 0.001
    return strip.u1


class Frame:
    """Tačka na površini u (u, v) i smer ka unutra (zrak parametra)."""

    def __init__(self, surf: O.Surface, param: O.Param, side: float = 1.0) -> None:
        self.surf, self.param, self.side = surf, param, side

    def at(self, u: float, v: float, d: float = 0.0) -> Vector:
        """Tačka površine, pa `d` metara ka unutra po normali (ne po zraku: na uglu je zrak kos, pa
        bi sočivo bočno prešlo preko prirubnice otvora)."""
        o, dirv = self.param.ray(u, v, self.side)
        loc, n = self.surf.hit(self.param, u, v, self.side)
        if loc is None:  # van površine (ne bi trebalo): projekcija na ravan zraka
            return o + dirv * (3.0 + d)
        n = n.normalized()
        if n.dot(dirv) > 0:
            n = -n
        return loc - n * d

    def inward(self, u: float, v: float) -> Vector:
        loc, n = self.surf.hit(self.param, u, v, self.side)
        dirv = self.param.ray(u, v, self.side)[1]
        if loc is None:
            return dirv
        n = n.normalized()
        return n if n.dot(dirv) > 0 else -n


def _quad(g: Geo, a, b, c, d, mat: str, hard: bool = False) -> None:
    g.f((g.v(a), g.v(b), g.v(c), g.v(d)), mat, None, hard)


def _grid(g: Geo, rows: list[list[Vector]], mat: str, flip: bool = False, hard: bool = False) -> None:
    idx = [[g.v(p) for p in r] for r in rows]
    for i in range(len(idx) - 1):
        for k in range(len(idx[0]) - 1):
            q = (idx[i][k], idx[i + 1][k], idx[i + 1][k + 1], idx[i][k + 1])
            g.f(tuple(reversed(q)) if flip else q, mat, None, hard)


def _us(ua: float, ub: float, n: int) -> list[float]:
    return [ua + (ub - ua) * i / n for i in range(n + 1)]


def lens(fr: Frame, strip: O.Strip, ua: float, ub: float, nu: int, nv: int, d0: float = 0.003, t: float = 0.003) -> Geo:
    """Sočivo: ljuska od ua do ub, prati površinu, sa debljinom i zatvorenim rubom."""
    g = Geo()
    front, back = [], []
    for u in _us(ua, ub, nu):
        lo, hi = strip.span(u)
        lo, hi = min(lo + INSET, hi), max(hi - INSET, lo)  # 1 mm od ivice otvora (prirubnica ostaje slobodna)
        vs = [lo + (hi - lo) * k / nv for k in range(nv + 1)]
        front.append([fr.at(u, v, d0) for v in vs])
        back.append([fr.at(u, v, d0 + t) for v in vs])
    _grid(g, front, LENS)
    _grid(g, back, LENS, flip=True)
    # rub sočiva je crn (sitotisak po obodu), pa ivica ne svetli kao hromirana traka
    _grid(g, [front[i][-1:] + back[i][-1:] for i in range(len(front))], BLACK)  # gornji rub
    _grid(g, [back[i][:1] + front[i][:1] for i in range(len(front))], BLACK)  # donji rub
    for col_f, col_b in ((front[0], back[0]), (front[-1], back[-1])):
        _grid(g, [col_f, col_b], BLACK)
    return g


def housing(fr: Frame, strip: O.Strip, ua: float, ub: float, nu: int, depth: float, mat: str, back_mat: str | None = None,
            d0: float = 0.008, inset: float = 0.002, taper: float = 0.85, cap_a: bool = True, cap_b: bool = True) -> Geo:
    """Kućište: kanal (gornji zid, dno, zadnji zid) od ivice sočiva unutra do `depth`, sa suženjem."""
    g = Geo()
    ring = []
    for u in _us(ua, ub, nu):
        lo, hi = strip.span(u)
        lo, hi = lo + inset, max(lo + inset, hi - inset)
        mid = (lo + hi) / 2
        lo2, hi2 = mid + (lo - mid) * taper, mid + (hi - mid) * taper
        ring.append([fr.at(u, hi, d0), fr.at(u, hi2, depth), fr.at(u, lo2, depth), fr.at(u, lo, d0)])
    _grid(g, [[r[0], r[1]] for r in ring], mat)
    _grid(g, [[r[1], r[2]] for r in ring], back_mat or mat)
    _grid(g, [[r[2], r[3]] for r in ring], mat)
    for r, ok in ((ring[0], cap_a), (ring[-1], cap_b)):
        if ok:
            _quad(g, r[0], r[1], r[2], r[3], mat)
    return g


def light_line(fr: Frame, strip: O.Strip, ua: float, ub: float, nu: int, dv: float, h: float, d: float, mat: str,
               w: float = 0.004) -> Geo:
    """Svetlosna linija (svetlovod) na visini top(u) − dv, presek h × w, na dubini d."""
    path = []
    for u in _us(ua, ub, nu):
        path.append(fr.at(u, strip.top(u) - dv, d))
    return sweep(path, rounded_rect(w, h, min(w, h) * 0.45, 2), mat, hard=False, up_hint=(0, 1, 0))


def _cup(fr: Frame, u: float, v: float, r: float, seg: int) -> Geo:
    """Projektor: hromirana reflektorska čaša, tamno sočivo i crni prsten, osa duž zraka."""
    g = Geo()
    cup = [(r * 0.30, -0.030), (r * 0.62, -0.024), (r * 0.88, -0.014), (r, -0.004), (r * 1.08, -0.002), (r * 1.08, 0.0)]
    g += lathe(cup, seg, CHROME, hard=False)
    g += lathe([(0.0, 0.0), (r * 0.45, -0.002), (r * 0.62, -0.006), (r * 0.62, -0.012), (0.0, -0.012)], seg, LENS, hard=False)
    ring = [(r * 0.62, -0.012), (r * 0.74, -0.012), (r * 0.74, -0.001), (r * 0.62, -0.001), (r * 0.62, -0.012)]
    g += lathe(ring, seg, BLACK, hard=False)
    # lokalna +Y = ka spolja (suprotno zraku); smesti u tačku površine
    p = fr.at(u, v, 0.012)
    out = -fr.inward(u, v)
    from lib.geo import look_axis

    return g.transform(look_axis(out)).moved(p.x, p.y, p.z)


# --------------------------------------------------------------------------- napred


def headlamp(fr: Frame, strip: O.Strip, lite: bool) -> Geo:
    """Far (levi): od SPLIT_F do kraja trake oko ugla."""
    g = Geo()
    ua, ub = O.SPLIT_F, outer_end(strip)
    nu = 28 if lite else 56
    g += lens(fr, strip, ua, ub, nu, 3 if lite else 5)
    g += housing(fr, strip, ua, ub, nu, 0.085, BLACK, cap_a=False)
    # neprekidna LED linija (DRL), ista visina kao u traci
    g += light_line(fr, strip, ua - 0.004, ub - 0.012, nu, 0.0075, 0.005, 0.011, LED)
    # crna pregrada ispod DRL linije
    g += light_line(fr, strip, ua + 0.03, ub - 0.02, nu // 2, 0.0165, 0.0018, 0.016, BLACK, w=0.014)
    # tri projektora, pa hromirani reflektor ka uglu
    seg = 14 if lite else 24
    for u in (-0.135, -0.065, 0.005):
        lo, hi = strip.span(u)
        v = (lo + hi - 0.0165) / 2
        r = min(0.019, (hi - 0.019 - lo) / 2)
        g += _cup(fr, u, v, r, seg)
    # ka uglu: niz malih LED reflektora (pokazivač pravca i svetla za skretanje), bez narandžaste boje
    seg_s = 10 if lite else 16
    n_led = 4 if lite else 6
    for k in range(n_led):
        u = 0.055 + (ub - 0.03 - 0.055) * k / (n_led - 1)
        lo, hi = strip.span(u)
        r = min(0.0095, max(0.004, (hi - 0.019 - lo) / 2 * 0.85))
        g += _cup(fr, u, (lo + hi - 0.0165) / 2, r, seg_s)
    return g


def front_bar(fr: Frame, strip: O.Strip, lite: bool) -> Geo:
    """LED traka (leva polovina): od sredine do fara."""
    g = Geo()
    ua, ub = -0.55, O.SPLIT_F
    nu = 14 if lite else 28
    g += lens(fr, strip, ua, ub, nu, 2)
    g += housing(fr, strip, ua, ub, nu, 0.040, BLACK, cap_a=False, cap_b=False)
    g += light_line(fr, strip, ua, ub + 0.004, nu, 0.0075, 0.005, 0.011, LED)
    return g


# --------------------------------------------------------------------------- pozadi


def taillamp(fr: Frame, strip: O.Strip, lite: bool) -> Geo:
    """Stop svetlo (levo): gornja crvena linija (nastavak trake), kontura koja obilazi spoljni kraj i
    vraća se po donjoj ivici, dublja srednja linija (3D) i hromirani reflektor za vožnju unazad."""
    g = Geo()
    ua, ub = O.SPLIT_R, outer_end(strip)
    nu = 24 if lite else 48
    g += lens(fr, strip, ua, ub, nu, 3 if lite else 5)
    g += housing(fr, strip, ua, ub, nu, 0.070, BLACK, cap_a=False)
    g += light_line(fr, strip, ua - 0.004, ub - 0.014, nu, 0.0070, 0.005, 0.010, LED_RED)
    # kontura: od gornje linije oko spoljnog kraja, pa nazad po donjoj ivici
    path = []
    u_turn = ub - 0.016
    lo_t, hi_t = strip.span(u_turn)
    for k in range(7):
        a = math.pi / 2 * (1 - k / 6) - math.pi / 2 * (k / 6)
        cv = (lo_t + hi_t) / 2
        rv = (hi_t - lo_t) / 2 - 0.007
        path.append(fr.at(u_turn + 0.008 * math.cos(a) - 0.008, cv + rv * math.sin(a), 0.011))
    for u in _us(u_turn - 0.01, ua + 0.07, nu // 2):
        lo, _hi = strip.span(u)
        path.append(fr.at(u, lo + 0.007, 0.011))
    g += sweep(path, rounded_rect(0.0055, 0.006, 0.0022, 2), LED_RED, hard=False, up_hint=(0, 1, 0))
    # 3D lamele između gornje i donje linije (kočiono svetlo), na različitoj dubini
    n_bl = 4 if lite else 7
    for k in range(n_bl):
        u = ua + 0.10 + (ub - 0.07 - ua - 0.10) * k / (n_bl - 1)
        lo, hi = strip.span(u)
        d0 = 0.016 + 0.004 * (k % 2)
        pts = [fr.at(u - 0.0012, lo + 0.011, d0), fr.at(u + 0.0012, lo + 0.011, d0), fr.at(u + 0.0012, hi - 0.012, d0), fr.at(u - 0.0012, hi - 0.012, d0)]
        dd = fr.inward(u, (lo + hi) / 2) * 0.014
        gg = Geo()
        ids = [gg.v(q) for q in pts + [q + dd for q in pts]]
        for q in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
            gg.f(tuple(ids[i] for i in q), LED_RED, None, True)
        g += gg
    # srednja linija, dublje (vidi se kao druga ravan kad se gleda ukoso)
    pts = []
    for u in _us(ua + 0.09, ub - 0.05, nu // 2):
        lo, hi = strip.span(u)
        pts.append(fr.at(u, (lo + hi) / 2, 0.026))
    g += sweep(pts, rounded_rect(0.010, 0.003, 0.0012, 2), LED_RED, hard=False, up_hint=(0, 1, 0))
    # svetlo za vožnju unazad: hromirani reflektor u unutrašnjem kraju
    g += housing(fr, strip, ua + 0.006, ua + 0.055, 6, 0.030, CHROME, d0=0.016, inset=0.011, taper=0.75)
    return g


def rear_bar(fr: Frame, strip: O.Strip, lite: bool) -> Geo:
    """LED traka pozadi (leva polovina): crvena linija i vertikalna rebra iza nje."""
    g = Geo()
    ua, ub = -0.55, O.SPLIT_R
    nu = 14 if lite else 30
    g += lens(fr, strip, ua, ub, nu, 2)
    g += housing(fr, strip, ua, ub, nu, 0.034, BLACK, cap_a=False, cap_b=False)
    g += light_line(fr, strip, ua, ub + 0.004, nu, 0.0070, 0.0045, 0.010, LED_RED)
    if not lite:
        n = int((ub - ua) / 0.016)
        for i in range(n):
            u = ua + 0.008 + i * 0.016
            lo, hi = strip.span(u)
            a, b = fr.at(u - 0.0007, lo + 0.002, 0.015), fr.at(u + 0.0007, lo + 0.002, 0.015)
            c, d = fr.at(u + 0.0007, hi - 0.002, 0.015), fr.at(u - 0.0007, hi - 0.002, 0.015)
            dd = fr.inward(u, (lo + hi) / 2) * 0.012
            gg = Geo()
            ids = [gg.v(p) for p in (a, b, c, d, a + dd, b + dd, c + dd, d + dd)]
            for q in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                gg.f(tuple(ids[i] for i in q), BLACK, None, True)
            g += gg
    return g


def build(ctx, only=None) -> None:
    lite = ctx.lite
    O.ensure(ctx.quality)
    surf = O.STATE["surf"]
    sf, sr = O.STATE["strips"]["front"], O.STATE["strips"]["rear"]
    ff, fr_ = Frame(surf, O.Param("front")), Frame(surf, O.Param("rear"))
    cap = 3 if lite else 5
    hl = headlamp(ff, sf, lite)
    ctx.add_part("far", "l", hl, cap=cap)
    ctx.add_part("far", "d", hl.mirrored_x(), cap=cap)
    bar = front_bar(ff, sf, lite)
    bar += bar.mirrored_x()
    ctx.add_part("led_traka_prednja", "", bar, cap=cap)
    tl = taillamp(fr_, sr, lite)
    ctx.add_part("stop_svetlo", "l", tl, cap=cap)
    ctx.add_part("stop_svetlo", "d", tl.mirrored_x(), cap=cap)
    rb = rear_bar(fr_, sr, lite)
    rb += rb.mirrored_x()
    ctx.add_part("led_traka_zadnja", "", rb, cap=cap)
    _ = math
