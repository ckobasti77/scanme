"""Fokus kamere po delu (A01 §4.2, A08): az (0 = spreda, 90 = sleva), el (pozitivno = odozgo), dist.

Ugao je izabran tako da se deo vidi sa strane na kojoj je (leve instance; desne preslikava export),
bez zaklanjanja koliko god može. Daljinu računa export iz veličine dela, osim gde piše `dist`.
Pregledač i dalje probava susedne uglove i providne zaklanjače (A04), ovo je početni ugao.
"""

DEFAULT_AZ = 35.0
DEFAULT_EL = 18.0

OVERRIDES: dict[str, dict] = {
    # karoserija
    "hauba": {"az": 30.0, "el": 35.0},
    "blatobran": {"az": 60.0, "el": 15.0},
    "vrata_prednja": {"az": 80.0, "el": 10.0},
    "vrata_zadnja": {"az": 100.0, "el": 10.0},
    "prag": {"az": 90.0, "el": 6.0},
    "krov": {"az": 40.0, "el": 45.0},
    "poklopac_prtljaznika": {"az": 160.0, "el": 30.0},
    "skelet": {"az": 40.0, "el": 20.0},
    "branik_prednji": {"az": 20.0, "el": 8.0},
    "branik_zadnji": {"az": 160.0, "el": 8.0},
    "maska": {"az": 10.0, "el": 8.0},
    "retrovizor": {"az": 60.0, "el": 15.0},
    "vetrobran": {"az": 20.0, "el": 30.0},
    "zadnje_staklo": {"az": 160.0, "el": 30.0},
    "bocna_stakla": {"az": 90.0, "el": 15.0},
    # enterijer: odozgo i sa strane vozača, kroz staklo
    "sediste_prednje": {"az": 70.0, "el": 35.0},
    "zadnja_klupa": {"az": 110.0, "el": 40.0},
    "tabla": {"az": 50.0, "el": 45.0},
    "volan": {"az": 70.0, "el": 30.0},
    "konzola": {"az": 60.0, "el": 55.0},
    "pedale": {"az": 70.0, "el": 15.0, "dist": 1.3},
    # motor: usis levo, izduv desno
    "blok_motora": {"az": 50.0, "el": 25.0},
    "glava_motora": {"az": 40.0, "el": 35.0},
    "poklopac_ventila": {"az": 30.0, "el": 45.0},
    "usisna_grana": {"az": 70.0, "el": 35.0},
    "izduvna_grana": {"az": -70.0, "el": 30.0},
    "turbopunjac": {"az": -140.0, "el": 40.0},  # iza desnog prednjeg točka, preko praga
    "starter_generator": {"az": 60.0, "el": 15.0},
    "karter": {"az": 40.0, "el": -20.0},
    "remenski_prenos": {"az": 10.0, "el": 15.0},
    # usis i izduv
    "filter_vazduha": {"az": 40.0, "el": 35.0},
    "usisne_cevi": {"az": -40.0, "el": 35.0},
    "katalizator": {"az": -60.0, "el": -25.0},
    "gpf": {"az": -50.0, "el": -25.0},
    "srednji_lonac": {"az": -30.0, "el": -25.0},
    "zadnji_lonac": {"az": 160.0, "el": -10.0},
    # hlađenje
    "hladnjak": {"az": 15.0, "el": 15.0},
    "interkuler": {"az": 15.0, "el": 5.0},
    "ventilator": {"az": 25.0, "el": 25.0},
    "ekspanziona_posuda": {"az": -45.0, "el": 30.0},
    "creva_hladjenja": {"az": -30.0, "el": 35.0},
    # prenos: odozdo
    "menjac": {"az": 60.0, "el": -20.0},
    "prenosna_kutija": {"az": 50.0, "el": -25.0},
    "kardan_prednji": {"az": 60.0, "el": -20.0},
    "kardan_zadnji": {"az": 40.0, "el": -25.0},
    "diferencijal_prednji": {"az": 50.0, "el": -15.0},
    "diferencijal_zadnji": {"az": 150.0, "el": -15.0},
    "poluosovina_prednja": {"az": 30.0, "el": -10.0},
    "poluosovina_zadnja": {"az": 150.0, "el": -10.0},
    # vešanje i upravljanje
    "ramena_prednja": {"az": 50.0, "el": 10.0},
    "ramena_zadnja": {"az": 130.0, "el": 10.0},
    "amortizer_prednji": {"az": 60.0, "el": 20.0},
    "amortizer_zadnji": {"az": 120.0, "el": 20.0},
    "stabilizator_prednji": {"az": 25.0, "el": -15.0},
    "stabilizator_zadnji": {"az": 155.0, "el": -15.0},
    "podokvir_prednji": {"az": 35.0, "el": -25.0},
    "podokvir_zadnji": {"az": 145.0, "el": -25.0},
    "letva_volana": {"az": 20.0, "el": -15.0},
    # kočnice i točkovi
    "felna_prednja": {"az": 75.0, "el": 8.0},
    "felna_zadnja": {"az": 105.0, "el": 8.0},
    "guma_prednja": {"az": 70.0, "el": 8.0},
    "guma_zadnja": {"az": 110.0, "el": 8.0},
    "disk_prednji": {"az": 80.0, "el": 10.0},
    "disk_zadnji": {"az": 100.0, "el": 10.0},
    "celjust_prednja": {"az": 100.0, "el": 10.0},
    "celjust_zadnja": {"az": 110.0, "el": 10.0},
    "kocioni_modul": {"az": 60.0, "el": 40.0},
    # energija
    "rezervoar": {"az": 50.0, "el": -30.0, "dist": 2.4},
    "pumpa_goriva": {"az": 70.0, "el": 50.0},
    "visokopritisna_pumpa": {"az": 70.0, "el": 40.0},
    "baterija_48v": {"az": 140.0, "el": 40.0},
    "akumulator_12v": {"az": -140.0, "el": 40.0},
    # elektrika
    "far": {"az": 30.0, "el": 10.0},
    "led_traka_prednja": {"az": 10.0, "el": 10.0},
    "stop_svetlo": {"az": 150.0, "el": 10.0},
    "led_traka_zadnja": {"az": 170.0, "el": 10.0},
    "ecu_motora": {"az": 70.0, "el": 40.0},
    "kablovski_snop": {"az": 40.0, "el": 40.0, "dist": 4.0},
}
