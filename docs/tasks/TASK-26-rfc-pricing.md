# TASK-26 — RFC-002: cene, konfigurator kupovine, Enterprise nalog, admin sloj

Ovaj task **ne piše nijednu liniju proizvodnog koda.** On piše
`docs/architecture/RFC-002-pricing-and-purchase.md` — dokument iz koga izlazi
trinaest narednih taskova, po istom obrascu kao RFC-001. Ako RFC ne odgovori na
neko pitanje, taj propust se otkriva tri taska kasnije, kad je skup.

Pre pisanja: pročitaj `docs/architecture/RFC-001-venue-memories.md` (posebno
entitlemente i tenancy), `convex/lib/entitlements.ts`, `convex/lib/plans.ts`,
`convex/schema.ts` (`businesses`, `serviceProfiles`, `cards`), `convex/cards.ts`
(resolver `/r/[cardCode]`), i postojeći konfigurator fizičkih proizvoda u
`components/` i `app/`. Dokument mora da se oslanja na ono što stvarno postoji,
ne na ono kako bi bilo zgodno da izgleda.

---

## 1. Šta se prodaje — model, tačno

Pet usluga: **ScanMe Links, Venue, Memories, Menu (još ne postoji), Review.**

Dve nezavisne ose cene, i to je ključ celog dokumenta:

**Osa A — usluge.** Svaka usluga ima svoju cenu, i ta cena zavisi od toga da li
se plaća mesečno ili godišnje. Usluge se kupuju pojedinačno ili u bilo kojoj
kombinaciji; svih 31 nepraznih podskupova je legalno.

**Osa B — plan naloga.** `Basic` (besplatan), `Premium` (fiksna cena, mesečno
ili godišnje), `Enterprise` (na upit). Plan je **na nivou naloga, ne po
usluzi**: Premium otključava premium mogućnosti na svim uslugama koje nalog ima
i na svakoj koju kasnije doda, bez doplate.

**Basic je besplatan plan, ali usluge se i dalje plaćaju.** Zapiši to izričito
— to je rečenica koju će neko sigurno pogrešno pročitati.

Google Review nema planove. Predlog za odluku u dokumentu: Review je besplatan
od četvrte usluge naviše. To je jedina stvar koja nekoga ko je stao na tri gura
na četiri, a košta malo.

---

## 2. Cenovni motor — čista funkcija, i njena pravila

`price({ items: [{ usluga, period }], plan }) → razrada`

**Cena zavisi isključivo od izabranog skupa i plana.** Nikad od redosleda
kupovine, nikad od istorije, nikad od datuma. Dva klijenta sa istim izborom
plaćaju isto. Sve drugo je bomba jer ljudi razgovaraju međusobno.

Algoritam:

1. Grupiši stavke po periodu (popust važi samo unutar iste grupe — to je
   pravilo koje je vlasnik dao i ono само sebe objašnjava kupcu).
2. Za svaku grupu: probaj **svih 2^n razlaganja** na {imenovani paketi} ∪
   {pojedinačne usluge} i uzmi najjeftinije za kupca. n ≤ 5, dakle nabrajanje,
   nikakva heuristika.
3. Na ono što ostane van paketa primeni merdevine po poziciji
   (1. 0%, 2. 20%, 3. 30%, 4. 40%, 5. 50%), **od najjeftinije usluge naviše** —
   najskuplja stavka nikad ne ide na rasprodaju.
4. Zbir grupa + cena plana.

Imenovani paketi: **Događaj** (Venue+Memories), **Lokal** (Links+Menu),
**Kompletan ScanMe** (svih pet). Paket važi samo ako su sve njegove usluge u
istoj grupi perioda.

**Paket nije poseban SKU nego marketing.** Ako neko klikne Venue pa Memories
pojedinačno, mora automatski dobiti cenu Događaj paketa. Nemoguće je da neko
plati više zato što je do istog skupa došao drugim putem — i to je test.

Četiri tvrde provere, kao `throw`, ne kao „brojevi su tako podešeni":

1. nijedna stavka ispod 50% svoje liste
2. ukupan popust nikad preko 45%
3. korpa nikad jeftinija od najskuplje pojedinačne usluge u njoj
4. dodavanje usluge nikad ne smanjuje ukupno; **razdvajanje po periodima nikad
   nije jeftinije od objedinjavanja**

Cene su placeholder konstante u jednom fajlu — vlasnik ih popunjava kasnije.
Motor ne sme da mari koji su brojevi. Premium cena takođe placeholder.

**Golden tabela**: svih 31 podskupova × 2 plana × cepanja po periodu, sa
očekivanom cenom. Isti obrazac kao Links harness — cena je stvar koju ne smeš
da promeniš slučajno. Isti fajl motora uvezen na tri mesta: marketinška
stranica, server pri naplati, faktura. Ako klijent i server ikad izračunaju
različito, to nije bag nego pravni problem.

---

## 3. Enterprise — nalog iznad lokala

Danas je `businesses` sam sebi vlasnik: jedan lokal, jedan nalog. Enterprise
znači **jedan nalog iznad više lokala** (10–15), **jedan login vidi sve njih**,
jedan plan i jedna naplata za sve.

To je izmena šeme i dodir u `requireBusinessAccess` — najosetljiviji kod koji
postoji. RFC mora da odluči i zapiše:

- oblik nove tabele (`accounts`?) i kako se `businesses` vezuje za nju
- šta se dešava sa postojećim redovima (popuna: svaki postojeći lokal dobija
  svoj nalog od jednog člana) i da li ijedan postojeći tok menja ponašanje
- kako `getEntitlement` razrešava plan sa nivoa naloga naniže, uz postojeći
  redosled space-scoped → business-scoped
- da li Enterprise deli entitlemente na sve lokale ili se dodeljuju po lokalu

Ovo ide kao zaseban task, u PLAN modu, rano — i ne meša se ni sa čim drugim.

---

## 4. Tok kupovine — četiri koraka u jednoj ljusci

**Ljuska je ram i traka**: zaobljeni panel, zaglavlje, timeline gore, lepljiva
traka dole sa ukupnim iznosom i dugmetom. Ne menja se i ne nestaje ni u jednom
koraku. Tri panela nisu ljuska — oni su samo ono što prvi i treći korak stave
unutra. Drugi korak stavlja unutra nešto drugo. Stanje u URL-u, da se
konfiguracija može poslati linkom.

**Korak 1 — usluge.** Prekidač mesečno/godišnje **na vrhu**, iznad liste, jer
menja svaku cenu na ekranu; cene se animirano preliju kad se prebaci. Levi
panel: pet usluga + kombo kartice, klik proširuje. Sredina: **živi prikaz na
telefonu prave stranice te usluge** — to je odgovor na „čovek ne zna šta je
Venue", pokažeš mu umesto da objašnjavaš. Desni panel: živa korpa sa precrtanim
cenama, uštedom u dinarima i jednim redom *„Dodaj Meni i štediš još 900."*

Svaka kartica usluge nosi šta se dobija, pa ispod, odvojeno tankom linijom i
drugom bojom, jedan red: *„Sa Premium nalogom još i: …"*.

**Korak 2 — plan.** Dve kolone preko cele širine. Basic: spisak, gore
*„Uključeno, ne plaćaš ništa."* Premium: prva stavka **„Sve iz Basic-a"**, pa
nove stavke **grupisane po usluzi koju je izabrao**, sa imenom usluge kao
sitnim nadnaslovom — ništa što nije kupio. Poslednja stavka, uvek:
*„Sve buduće usluge automatski na Premium-u."*

**Nikad ne deliti Premium cenu na broj usluga.** Poruka je da si velikodušan:
platio jednom, važi svuda. Deljenje na komad sugeriše da se Premium prodaje po
usluzi i da mu je nešto upakovano.

Enterprise **nije treća ravnopravna kartica** — on je slepa ulica u toku (vodi
u kontakt formu, ne u treći korak) i tiče se 2% posetilaca. Ide kao tiši red
ispod: *„Imate 10+ lokala? Napravićemo ponudu po meri →"*.

**Korak 3 — fizički proizvodi.** Jedan prolaz, nikad N prolaza. Vezivanje za
uslugu je osobina stavke u korpi i živi u **desnom sidebaru, kao prva stavka,
iznad Orijentacije** — jer usluga određuje koji su šabloni dostupni, pa mora
pre dizajna. Vizuelno izdvojena i obavezna. **Ako je kupio samo jednu uslugu,
stavka se ne prikazuje uopšte** i tiho je vezana. Ako promeni uslugu na stavci
koja već ima izabran dizajn koji za novu uslugu ne postoji — vrati na
podrazumevani i napiši jedan red zašto.

Oznaka gore desno (`ScanMe Review · Premium · godišnje`) **prestaje da bude
kontrola**: skini strelicu, neka piše sažetak cele porudžbine
(`3 usluge · Premium · godišnje`), klik otvara korpu. Dve kontrole koje obe
pišu ime usluge i obe izgledaju promenljivo su greška koja se dobija tiho.

Glavni red ukupnog iznosa razdvaja dve vrste novca:
**`9.990 RSD godišnje · + 24.000 RSD jednokratno`**.

**Korak 4 — checkout.** Kreira porudžbinu, dodeljuje entitlemente. Plaćanje je
stub (srpski provajder nije izabran). **Plaćena cena se snima u porudžbinu**
kao snimak — isto kao provizija u `partnerships`; entitlement je živa dozvola.
Dizanje cena kasnije ne dira postojećeg klijenta.

---

## 5. Razdelnik — jedna kartica, više usluga

Tehnička istina: jedna kartica = jedan kod = jedno odredište. Kartica ne može
da pokazuje na dve stvari — osim ako to odredište nije razdelnik.

Odluka: **jedna kartica za više usluga vodi na ScanMe Links stranicu.** Ko nema
Links, dobija goli razdelnik — dugmad i ništa više, namerno bez uređivanja
izgleda, da svako kome je stalo kako to izgleda kupi Links. Poštena lestvica,
ne trik.

**Upozorenje koje mora da uđe u RFC, a ne da se otkrije kasno:** Memories računa
kvotu **po kartici stola**. Ako kartica vodi na razdelnik pa tek onda na
Memories, identitet stola mora da preživi taj skok do `/m/[code]`. Ako se
izgubi, kvota po stolu prestaje da postoji i model naplate Memories-a pada.

---

## 6. Admin — sloj iznad postojećeg

Tabela **svih** korisnika kao operativno srce, ne kao spisak. Kolone: naziv,
telefon, aktivne usluge, plan, period, **status**, **sledeća obnova**, akcije.
Podrazumevano sortirano po obnovi — to je radna lista.

Status u boji, četiri stanja, i četvrto je najvažnije: aktivan · ističe za
manje od 14 dana · istekao · **plaćeno ali nikad podešeno**. To poslednje
predviđa otkaz i nevidljivo je ako se ne napravi.

**Enterprise je jedan red koji se širi u svoje lokale**, ne petnaest redova.
Levi sidebar sa lokalima postoji **samo unutar Enterprise korisnika**; za sve
ostale je stranica pune širine.

Aktivacija i deaktivacija usluga iz tabele, i **svaka izmena piše trag — ko,
šta, kada.** Ručno se dodeljuju plaćene stvari; bez loga je prvi spor nerešiv.
Podstranice po lokalu (Links / Review / Venue / Menu) prikazuju se samo za
aktivne usluge; `Page` se preimenuje u `Menu` kad Menu bude postojao.

---

## 7. Šta RFC mora da isporuči

- `docs/architecture/RFC-002-pricing-and-purchase.md`, po strukturi RFC-001
- za svaku odluku: šta je odlučeno **i šta je odbačeno i zašto** — RFC-001 je
  bio koristan upravo zbog odbačenih opcija
- katalog tabela/tipova koje treba dodati, sa razlogom za svaku
- spisak mesta u postojećem kodu koja se diraju, sa procenom rizika
- **ScanMe Links je i dalje zamrznut** — ako neka odluka traži dodir u njega,
  to mora da bude izričito označeno kao blokirano na vlasnikovu odluku
- otvorena pitanja koja RFC ne rešava, imenovana, sa onim ko ih rešava

Ne piši nijedan `.ts` fajl. Ne diraj šemu. Ovaj task proizvodi jedan dokument.
