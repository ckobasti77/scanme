"""Mere i tvrde tačke limuzine (prostor vozila, metri). Izvor: docs/AUTO3D-PLAN.md §3, A01 §1.1."""

LENGTH = 4.980
WIDTH = 1.940
WIDTH_MIRRORS = 2.130
HEIGHT = 1.440
WHEELBASE = 2.980
OVERHANG_F = 0.890
OVERHANG_R = 1.110
TRACK_F = 1.630
TRACK_R = 1.650
CLEARANCE = 0.130

Z_AXLE_F = WHEELBASE / 2  # +1.49
Z_AXLE_R = -WHEELBASE / 2  # -1.49
Z_TIP_F = Z_AXLE_F + OVERHANG_F  # +2.38
Z_TIP_R = Z_AXLE_R - OVERHANG_R  # -2.60
X_WHEEL_F = TRACK_F / 2  # 0.815
X_WHEEL_R = TRACK_R / 2  # 0.825

# gume: 255/35 R21 napred, 285/30 R21 pozadi
RIM_D = 21 * 0.0254  # 0.5334 sedište gume
TIRE_W_F, TIRE_W_R = 0.255, 0.285
TIRE_R_F = (RIM_D + 2 * 0.35 * TIRE_W_F) / 2  # 0.35595
TIRE_R_R = (RIM_D + 2 * 0.30 * TIRE_W_R) / 2  # 0.35220
SQUASH = 0.008  # sabijanje gume pod težinom
Y_WHEEL_F = TIRE_R_F - SQUASH  # 0.348
Y_WHEEL_R = TIRE_R_R - SQUASH  # 0.344
ARCH_GAP = 0.030
ARCH_R_F = TIRE_R_F + ARCH_GAP  # 0.386
ARCH_R_R = TIRE_R_R + ARCH_GAP  # 0.382

# felne: 9,0J ET30 napred, 10,5J ET35 pozadi -> naleganje glavčine
RIM_W_F, RIM_W_R = 9.0 * 0.0254, 10.5 * 0.0254
ET_F, ET_R = 0.030, 0.035
X_HUB_F = X_WHEEL_F + ET_F  # 0.845
X_HUB_R = X_WHEEL_R + ET_R  # 0.860

# kočnice
DISC_R_F, DISC_T_F = 0.200, 0.038
DISC_R_R, DISC_T_R = 0.190, 0.030
X_DISC_F = 0.790
X_DISC_R = 0.805
CAL_ANGLE = 15.0  # čeljust iza osovine, stepeni iznad horizontale
PAD_R_F, PAD_R_R = 0.155, 0.147

# karoserija
HALF_W = WIDTH / 2  # 0.97
X_MIRROR = WIDTH_MIRRORS / 2  # 1.065
Y_ROOF = HEIGHT
Z_A_BASE = Z_AXLE_F - 1.000  # 0.49 (dash-to-axle)
Y_BELT = 0.960

# motor (uzdužno, radilica po z)
CRANK_Y = 0.400
BLOCK_Z = (0.98, 1.62)

# A08: prednji diferencijal levo od kartera, izlazi na y 0.272; desna poluosovina prolazi kroz
# tunel u karteru (osovine su ~0.13 m ispod radilice, pa ugao poluosovina ide naviše ka točku)
FRONT_DIFF_X = 0.235
FRONT_DIFF_Y = 0.272


def wheel_center(front: bool, left: bool = True) -> tuple[float, float, float]:
    x = X_WHEEL_F if front else X_WHEEL_R
    return (x if left else -x, Y_WHEEL_F if front else Y_WHEEL_R, Z_AXLE_F if front else Z_AXLE_R)
