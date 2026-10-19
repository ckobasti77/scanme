"""Rasklapanje po delu (A01 §2.3–2.4): smer (prostor vozila, za prvu instancu), dist (m), faza 0–3.

Desna instanca (`d`) preslikava x. Turbopunjač ima zasebne smerove za `p` i `z`. A08 štimuje
vrednosti uz `collide.py --motion`.
"""

E: dict[str, tuple[tuple[float, float, float], float, int]] = {
    # A08: koreografija po fazama (prozori A01 §2.4), proverena sa collide.py --motion.
    # faza 0: spoljni delovi; faza 1: paneli, točkovi sa gumama, izduv (dole), prednji stabilizator;
    # faza 2: vešanje i kočnice (napolje), enterijer (gore), podokviri (dole), kardan, energija;
    # faza 3: pogonski sklop. Školjka, blok motora i kablovski snop ostaju na mestu.
    # karoserija
    "hauba": ((0, 0.75, 0.66), 0.90, 0),  # A09: faza 0 (sa farovima): isturena ivica haube je iznad ugla fara
    "blatobran": ((0.91, 0.41, 0), 1.21, 1),  # brže napolje od točka, pa luk ne prelazi preko gume
    "vrata_prednja": ((0.96, 0.15, 0.22), 0.75, 1),
    "vrata_zadnja": ((0.96, 0.15, 0.22), 0.75, 1),  # kao prednja: dalje od zadnjeg točka
    "prag": ((0.80, -0.60, 0), 0.35, 1),
    "krov": ((0, 1, 0), 1.10, 1),
    "poklopac_prtljaznika": ((0, 0.70, -0.71), 0.80, 1),
    "skelet": ((0, 1, 0), 0.0, 1),
    "branik_prednji": ((0, -0.05, 1), 0.70, 0),
    "branik_zadnji": ((0, 0, -1), 0.65, 0),  # tačno duž osa izlaza izduva: izrezi klize preko cevi
    "maska": ((0, 0.03, 1), 1.05, 0),  # A09: skoro vodoravno, maska je sada tik ispod farova
    "retrovizor": ((0.60, 0.80, 0), 0.75, 0),
    "vetrobran": ((0, 0.86, 0.51), 1.20, 0),  # iznad konačnog položaja table
    "zadnje_staklo": ((0, 0.90, -0.44), 0.60, 0),
    "bocna_stakla": ((0.55, 0.83, 0), 0.50, 0),
    # enterijer: gore kroz otvor krova (tabla je uža od razmaka A-stubova)
    "sediste_prednje": ((0, 1, 0), 0.70, 2),
    "zadnja_klupa": ((0, 1, 0), 0.65, 2),
    "tabla": ((0, 1, 0), 0.90, 2),  # pravo gore (ispod lima ispred vetrobrana nema ničega)
    "volan": ((0, 0.90, -0.44), 0.80, 2),
    "konzola": ((0, 1, 0), 0.50, 2),
    "pedale": ((0, 0.30, -0.95), 0.30, 2),
    # motor
    "blok_motora": ((0, 1, 0), 0.0, 3),
    "glava_motora": ((0, 1, 0), 0.28, 3),
    "poklopac_ventila": ((0, 1, 0), 0.55, 3),
    "usisna_grana": ((0, 1, 0), 0.45, 2),  # pre visokopritisne pumpe i razvodnika ispod kanala
    "izduvna_grana": ((0, 1, 0), 0.0, 3),  # ostaje uz blok: iznad nje su usisne cevi, ispod cev punjenja
    "turbopunjac": ((-1, 0, 0), 0.45, 3),  # prednji pravo napolje (ispod je pomerena desna poluosovina); ulaz i izlaz kompresora se odvajaju bočno i duž ose
    "starter_generator": ((0.80, -0.20, -0.57), 0.40, 3),  # unazad i spolja: remenica izlazi iz ravni kaiša, ispod snopa
    "karter": ((0, -1, 0), 0.30, 3),
    "remenski_prenos": ((0, -0.30, 0.95), 0.35, 3),  # napred i malo dole, ispod prelazne usisne cevi
    # usis i izduv (izduv ide prvi, pre podokvira koji su iznad cevi)
    "filter_vazduha": ((0.30, 0.95, 0), 0.45, 2),  # pre usisnih cevi (cev do leptira ide ispod kutije), iznad snopa
    "usisne_cevi": ((0, 1, 0), 0.0, 3),  # ostaje uz blok: obavija izduvnu granu odozgo i odozdo
    "katalizator": ((-0.37, -0.93, 0), 0.75, 3),  # posle prednjeg podokvira; katalizatori prvo ispod poda
    "gpf": ((0, -1, 0), 0.80, 1),
    "srednji_lonac": ((0, -1, 0), 0.80, 1),
    "zadnji_lonac": ((0, -0.80, -0.60), 0.85, 1),
    # hlađenje: napred, slojevi redom (interkuler, hladnjak, ventilator)
    "hladnjak": ((0, 0.10, 0.99), 0.85, 3),
    "interkuler": ((0, -0.50, 0.866), 1.00, 3),  # ispred i ispod hladnjaka, ne do pomerenog branika; A09: dalje i brže od hladnjaka (interkuler je 20 mm bliže hladnjaku)
    "ventilator": ((0, 0.20, 0.98), 0.70, 3),
    "ekspanziona_posuda": ((-0.55, 0.83, 0), 0.40, 3),
    "creva_hladjenja": ((0, -0.70, 0.71), 0.45, 3),  # napred i dole, ispod prelazne usisne cevi
    # prenos
    "menjac": ((0, -1, 0), 0.45, 3),  # pravo dole kroz otvoren tunel (iza je prenosna kutija)
    "prenosna_kutija": ((0.15, -0.95, -0.27), 0.70, 3),  # dole i malo nazad: ispod tunela, ispred zadnjeg kardana
    "kardan_prednji": ((0.55, -0.84, 0), 0.30, 3),
    "kardan_zadnji": ((0, -1, 0), 0.35, 3),  # posle zadnjeg podokvira (poprečni nosač je ispod vratila), iz sedla rezervoara
    "diferencijal_prednji": ((0.30, -0.95, 0), 0.30, 3),
    "diferencijal_zadnji": ((0, -0.85, -0.53), 0.35, 3),
    "poluosovina_prednja": ((1, 0, 0), 0.45, 2),  # zajedno sa glavčinom; desna izlazi iz tunela kartera
    "poluosovina_zadnja": ((1, 0, 0), 0.45, 2),
    # vešanje
    "ramena_prednja": ((1, 0, 0), 0.45, 2),
    "ramena_zadnja": ((1, 0, 0), 0.45, 2),
    "amortizer_prednji": ((0, 1, 0), 0.60, 1),  # sa panelima: gore kroz otvor haube, pre nego što ramena krenu napolje
    "amortizer_zadnji": ((0.67, -0.74, 0), 0.67, 2),  # napolje zajedno sa polugama i dole, ispod luka
    "stabilizator_prednji": ((0, -1, 0), 0.35, 3),  # posle ramena, podokvira i letve: pravo dole
    "stabilizator_zadnji": ((0, -0.35, -0.94), 0.30, 1),  # nazad (spojna šipka sklizne sa ploče), ispod poda prtljažnika
    "podokvir_prednji": ((0, -1, 0), 0.45, 2),
    "podokvir_zadnji": ((0, -1, 0), 0.45, 2),
    "letva_volana": ((0, -1, 0), 0.35, 3),  # posle ramena i podokvira: pravo dole (napred su hladnjak i ventilator)
    # kočnice i točkovi: točak i guma u fazi 1, pa disk i čeljust (čeljust: disk + radijalno 0,25 m)
    "felna_prednja": ((1, 0, 0), 0.95, 1),
    "felna_zadnja": ((1, 0, 0), 0.95, 1),
    "guma_prednja": ((1, 0, 0), 0.95, 1),
    "guma_zadnja": ((1, 0, 0), 0.95, 1),
    "disk_prednji": ((1, 0, 0), 0.65, 2),
    "disk_zadnji": ((1, 0, 0), 0.65, 2),
    "celjust_prednja": ((0.933, 0.093, -0.347), 0.697, 2),
    "celjust_zadnja": ((0.933, 0.093, -0.347), 0.697, 2),
    "kocioni_modul": ((0, 1, 0), 0.45, 2),
    # energija
    "rezervoar": ((0, -1, 0), 0.0, 3),  # sedlo je preko tunela poda: ostaje na mestu, pumpa izlazi gore
    "pumpa_goriva": ((0, 1, 0), 0.35, 2),  # gore kroz servisni otvor
    "visokopritisna_pumpa": ((0, 1, 0), 0.45, 3),
    "baterija_48v": ((0, 1, 0), 0.50, 2),
    "akumulator_12v": ((0, 1, 0), 0.50, 2),
    # elektrika
    "far": ((0, 0.02, 1), 0.92, 0),  # malo brže od branika: izlazi iz otvora napred; A09: skoro vodoravno (isturena ivica haube iznad, viša maska ispod)
    "led_traka_prednja": ((0, 0.12, 0.99), 0.95, 0),
    "stop_svetlo": ((0.15, -0.10, -0.98), 0.55, 0),  # nazad i malo dole: gornja ivica ne klizi uz poklopac prtljažnika
    "led_traka_zadnja": ((0, 0.30, -0.95), 0.75, 0),
    "ecu_motora": ((1, -0.20, 0), 0.40, 3),
    "kablovski_snop": ((0, 1, 0), 0.0, 3),  # nervni sistem ostaje na mestu, kao školjka
}

# instanca -> izričit smer (kad nije prosto preslikavanje x)
INSTANCE_DIR: dict[tuple[str, str], tuple[float, float, float]] = {
    ("turbopunjac", "z"): (-0.60, -0.80, 0),  # zadnji prvo napolje, pored desnog nosača motora
}


def explode_for(part: str, instance: str) -> tuple[tuple[float, float, float], float, int]:
    d, dist, stage = E[part]
    if (part, instance) in INSTANCE_DIR:
        d = INSTANCE_DIR[(part, instance)]
    elif instance == "d":
        d = (-d[0], d[1], d[2])
    return d, dist, stage
