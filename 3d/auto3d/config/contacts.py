"""Dozvoljeni dodiri u sklopljenom stanju (collide.py): delovi koji se namerno dodiruju ili ulaze
jedan u drugi (prirubnice, ležajevi, cevi na nastavcima). Sve ostalo je greška pakovanja.
Par se piše bez sistema i instance: ("disk_prednji", "felna_prednja")."""

CONTACTS: set[frozenset[str]] = {
    frozenset(p)
    for p in [
        ("disk_prednji", "felna_prednja"), ("disk_zadnji", "felna_zadnja"),  # vijci kroz zvono diska
        ("felna_prednja", "guma_prednja"), ("felna_zadnja", "guma_zadnja"),  # guma na sedištu felne
        ("disk_prednji", "ramena_prednja"), ("disk_zadnji", "ramena_zadnja"),  # zvono na glavčini
        ("celjust_prednja", "ramena_prednja"), ("celjust_zadnja", "ramena_zadnja"),  # nosač čeljusti na rukavcu
        ("celjust_prednja", "disk_prednji"), ("celjust_zadnja", "disk_zadnji"),  # čeljust obuhvata disk
        ("amortizer_prednji", "ramena_prednja"), ("amortizer_zadnji", "ramena_zadnja"),  # oslonac na ramenu
        ("poluosovina_prednja", "ramena_prednja"), ("poluosovina_zadnja", "ramena_zadnja"),  # zglob u glavčini
        ("poluosovina_prednja", "diferencijal_prednji"), ("poluosovina_zadnja", "diferencijal_zadnji"),
        ("kardan_prednji", "diferencijal_prednji"), ("kardan_zadnji", "diferencijal_zadnji"),
        ("kardan_prednji", "prenosna_kutija"), ("kardan_zadnji", "prenosna_kutija"), ("menjac", "prenosna_kutija"),
        ("menjac", "blok_motora"), ("blok_motora", "glava_motora"), ("glava_motora", "poklopac_ventila"),
        ("blok_motora", "karter"), ("glava_motora", "usisna_grana"), ("glava_motora", "izduvna_grana"),
        ("izduvna_grana", "turbopunjac"), ("turbopunjac", "katalizator"), ("turbopunjac", "usisne_cevi"),
        ("blok_motora", "remenski_prenos"), ("starter_generator", "remenski_prenos"), ("blok_motora", "starter_generator"),
        ("glava_motora", "visokopritisna_pumpa"), ("usisna_grana", "usisne_cevi"), ("filter_vazduha", "usisne_cevi"),
        ("interkuler", "usisne_cevi"), ("hladnjak", "creva_hladjenja"), ("hladnjak", "ventilator"),
        ("ekspanziona_posuda", "creva_hladjenja"), ("blok_motora", "creva_hladjenja"), ("katalizator", "gpf"),
        ("gpf", "srednji_lonac"), ("srednji_lonac", "zadnji_lonac"), ("podokvir_prednji", "blok_motora"),
        ("podokvir_prednji", "ramena_prednja"), ("podokvir_zadnji", "ramena_zadnja"), ("podokvir_prednji", "letva_volana"),
        ("podokvir_zadnji", "diferencijal_zadnji"), ("letva_volana", "ramena_prednja"), ("stabilizator_prednji", "ramena_prednja"),
        ("stabilizator_zadnji", "ramena_zadnja"), ("stabilizator_prednji", "podokvir_prednji"), ("stabilizator_zadnji", "podokvir_zadnji"),
        ("rezervoar", "pumpa_goriva"), ("ecu_motora", "kablovski_snop"), ("tabla", "volan"), ("konzola", "tabla"),
        ("sediste_prednje", "konzola"), ("kocioni_modul", "kablovski_snop"),
        ("glava_motora", "creva_hladjenja"),
        ("creva_hladjenja", "remenski_prenos"),  # donje crevo navučeno na bočni usis pumpe vode
        ("kablovski_snop", "baterija_48v"), ("kablovski_snop", "akumulator_12v"),  # kleme
        ("far", "led_traka_prednja"), ("stop_svetlo", "led_traka_zadnja"),  # susedne svetlosne jedinice
    ]
}

# mehanika i enterijer kroz karoseriju (paneli, stakla, pod): samo namerni prolazi
BODY_CONTACTS: set[frozenset[str]] = {
    frozenset(p)
    for p in [
        ("rezervoar", "skelet"),  # grlo goriva izlazi kroz bok ispod poklopca
        ("zadnji_lonac", "branik_zadnji"),  # izlazi u izrezima branika
        ("kablovski_snop", "pod"),  # kabinski snop kroz gumenu uvodnicu u protivpožarnom zidu
    ]
}
