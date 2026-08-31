# ScanMe — biblioteka promptova za RFC-002 (TASK-27 .. TASK-41)
#
# Ovo NIJE lanac koji sam pusta taskove. Namerno: svaki task se pusta rucno,
# pregleda i spoji pre sledeceg. Tako su nadjeni GALLERY_READ_CAP, red u
# ConvexHttpClient-u i tri rupe u provizioniranju — sve izmedju taskova.
#
# Koriscenje (PowerShell 7 / pwsh preporuceno zbog dijakritike):
#   . .\scripts\tasks\Prompts.ps1
#   Show-Plan                 # tabela svih taskova
#   Show-Task 27              # ispis jednog taska
#   Copy-Task 27              # goal u clipboard, spremno za paste
#   Test-Goals                # provera da nijedan goal ne prelazi 4000 karaktera

$Script:Tasks = @(

@{ Id=27; Name='Cenovni motor + goldeni'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md u celini, pa uradi
zadatak 1 iz tabele u §4 (Implementation sequence).

Ovo je temelj svega sto dolazi posle. Motor je cista funkcija: cena zavisi
iskljucivo od izabranog skupa usluga i plana — nikad od redosleda kupovine,
nikad od istorije, nikad od datuma. Dva klijenta sa istim izborom placaju isto.

Algoritam je nabrajanje, ne heuristika: grupisi po periodu, pa za svaku grupu
probaj svih 2^n razlaganja na imenovane pakete i pojedinacne usluge i uzmi
najjeftinije za kupca. n <= 5.

Cetiri invarijante moraju da budu tvrde provere koje bacaju gresku, ne brojevi
koji su "tako podeseni":
1. nijedna stavka ispod 50% svoje liste
2. ukupan popust nikad preko 45%
3. korpa nikad jeftinija od najskuplje pojedinacne usluge u njoj
4. dodavanje usluge nikad ne smanjuje ukupno, i razdvajanje po periodima nikad
   nije jeftinije od objedinjavanja

Test koji je najvazniji, jer stiti od dve cene za istu korpu: ako neko izabere
Venue pa Memories pojedinacno, mora automatski dobiti cenu Dogadjaj paketa.
Paket nije poseban SKU nego marketing. Nemoguce je platiti vise zato sto si do
istog skupa dosao drugim putem.

Cene su placeholder konstante u jednom fajlu. Motor ne sme da mari koji su
brojevi. Golden tabela: svih 31 podskupova x 2 plana x cepanja po periodu.
Namerna izmena konstante koja bi prekrsila invarijantu mora da obori test.

ScanMe Links je zamrznut. npm run check cist, ukljucujuci harness:check i
harness:namespace.
'@ }

@{ Id=28; Name='Motor u marketing stranicu i ponudu, gasenje SAAS_PRICING'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md, pa uradi zadatak 2
iz §4.

Cilj je da postoji tacno jedan izvor cene. Marketinska pricing stranica, offer
konfigurator i buduci checkout moraju da uvoze isti fajl motora iz TASK-27.
Ako klijent i server ikad izracunaju razlicito, to nije bag nego pravni problem.

Stari tier model u lib/scanme-pricing.ts (SAAS_PRICING) se gasi. Matrice za
fizicke proizvode ostaju netaknute — one nisu deo ove ose.

Postojeci offer URL-ovi verzija v1-v4 moraju i dalje da se parsiraju. Link koji
je neko vec poslao ne sme da pukne.

ScanMe Links je zamrznut — proveri §6 RFC-a (freeze ledger) pre nego sto dotaknes
ijedan fajl. npm run check cist, ukljucujuci harness.
'@ }

@{ Id=29; Name='accounts + getEntitlement korak 3'; Model='Fable'; Effort='xhigh'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md, posebno §2.2 u
celini, pa uradi zadatak 3 iz §4.

PLAN mod jer ovo dira tenancy. Ali kljucna odluka RFC-a je da je taj dodir
promasaj za dlaku: nalog je sloj IZNAD businesses, a pristup ostaje po lokalu.

Tvrdo pravilo: requireBusinessAccess se NE MENJA. Nijedna linija. Enterprise
login stize do svojih 10-15 lokala kroz 10-15 businessMemberships redova — oblik
koji sema vec podrzava. Ako ti se u nekom trenutku ucini da ta funkcija mora da
se promeni, stani i prijavi umesto da je menjas.

getEntitlement dobija tacno jedan dodatni korak na dnu. Koraci 1 i 2 ostaju
bajt-identicni. Korak 3 se pali samo tamo gde su 1 i 2 vratili null — dakle
danasnji odgovor se nigde ne menja. To je i test: postojeci testovi pristupa i
entitlementa moraju da prodju bez ijedne izmene.

Backfill postojecih redova se SPECIFICIRA, ne izvrsava — isti obrazac kao
RFC-001 §2.1.6.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=30; Name='Enterprise provizioniranje + grupisanje u adminu'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.2 i §2.6, pa uradi
zadatak 4 iz §4.

Jedan admin korisnik mora da stigne do svih N lokala kroz NEPROMENJEN
requireBusinessAccess. To je kriterijum uspeha, i to je test.

Fan-out koji pravi nalog, N lokala i N clanstava mora da bude nastavljiv:
ako stane na pola, ponovno pokretanje ga dovrsava bez duplikata. Koristi
scheduler continuations kao sto rade postojeci sweep-ovi u convex/memories.ts.

U adminu Enterprise je JEDAN red koji se siri u svoje lokale, ne petnaest
redova. Solo korisnici ostaju pune sirine, bez sidebara.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=31; Name='orders + orderItems + snimak cene + billing port'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.5, pa uradi
zadatak 5 iz §4.

Sustina: entitlement je ziva dozvola, porudzbina je nepromenljiv zapis onoga
sto je prodato. Placena cena se snima u porudzbinu u trenutku prodaje — isti
obrazac koji RFC-001 vec koristi za proviziju u partnerships.

Test koji to dokazuje: promeni konstantu cene posle kreiranja porudzbine i
proveri da je priceSnapshot te porudzbine ostao bajt-identican. Dizanje cena
sutra ne sme da prepise ono sto je neko kupio danas.

Grandfathering zivi ovde, namerno van motora, da bi motor ostao cista funkcija
trenutnog skupa.

Placanje je stub protiv postojeceg billing port-a. Nijedno polje u semi ne ceka
izbor provajdera.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=32; Name='Naplata: uplate, ciklusi, statusi, rucni upis'; Model='Fable'; Effort='xhigh'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.5 i §2.6. Ovaj
zadatak nije u tabeli §4 — dodaje se izmedju zadataka 5 i 6, i pravi zivotni
ciklus naplate koji admin tabela kasnije samo prikazuje.

Vlasnik mora u svakom trenutku da zna: ko je kad platio, kome ide naplata, kome
je isteklo, ko kasni.

Najvaznija odluka, i nemoj je tretirati kao rezervnu opciju: RUCNI UPIS UPLATE
JE GLAVNI TOK. Prvih pedeset klijenata placa nalogom za prenos ili na ruke, ne
karticom. Admin mora da upise uplatu sa datumom i iznosom, i da to pomeri
sledecu naplatu. Ako sistem ume samo ono sto mu provajder javi, evidencija ce
se voditi u svesci.

Napravi istoriju uplata (ne samo poslednje stanje), datum sledece naplate,
grace period, i dnevni cron koji prevodi statuse. Cetiri statusa, i cetvrti je
najvazniji jer predvidja otkaz: aktivan, istice za manje od 14 dana, istekao,
placeno ali nikad podeseno.

Provajder ide kao adapter sa jednim stub-om, tako da je kasnije povezivanje
srpskog provajdera jedan fajl.

Svaka rucna izmena pise audit trag: ko, sta, kada. Rucno se dodeljuju placene
stvari — bez loga je prvi spor neresiv.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=33; Name='Ljuska kupovine + v5 URL kodek'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.3, pa uradi
zadatak 6 iz §4.

Ljuska su ram i traka: zaobljeni panel, zaglavlje, timeline sa cetiri koraka
gore, lepljiva traka dole sa ukupnim iznosom i dugmetom. Ne menja se i ne
nestaje ni u jednom koraku.

Tri panela NISU ljuska. Oni su samo ono sto koraci 1 i 3 stave unutra; korak 2
stavlja nesto drugo. Ako se pri prelasku u korak 2 ljuska ugasi pa upali, uradio
si pogresnu stvar.

Traka dole razdvaja dve vrste novca i nikad ih ne sabira u jedan broj:
9.990 RSD godisnje  ·  + 24.000 RSD jednokratno

Stanje u URL-u, prosiruje se postojeci kodek iz lib/offer-url.ts na v5, uz istu
strogu validaciju. Stari v1-v4 linkovi moraju i dalje da se parsiraju.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=34; Name='Korak 1 — izbor usluga, zivi prikaz, korpa'; Model='Opus 5'; Effort='xhigh'; Mode='AUTO'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.3, pa uradi
zadatak 7 iz §4.

Prekidac mesecno/godisnje ide NA VRH, iznad liste usluga, jer menja svaku cenu
na ekranu. Kad se prebaci, cene se animirano preliju naniže — to prebacivanje
samo po sebi prodaje godisnje.

Sredina ekrana je najvaznija stvar u celom toku: zivi prikaz na telefonu PRAVE
javne stranice te usluge. Covek ne zna sta je Venue; ne objasnjavaj mu, pokazi
mu. Prikaz je READ-ONLY — ne sme se izmeniti nijedan sablon ni dodati ijedan
prop postojecoj stranici. Citanje nije dodir.

Desni panel je ziva korpa: precrtane cene, usteda U DINARIMA a ne u procentima,
i jedan red koji racuna sledeci korak iz pravog motora: "Dodaj Meni i stedis jos
900." Taj red mora da bude istinit, dakle izracunat, nikad zakucan.

Svaka kartica usluge nosi sta se dobija, pa ispod, odvojeno tankom linijom i
drugom bojom, jedan red: "Sa Premium nalogom jos i: ...".

Ukupno u korpi mora da bude jednako onome sto motor iz TASK-27 vraca.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=35; Name='Korak 2 — Basic vs Premium + Enterprise upit'; Model='Sonnet 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.3, pa uradi
zadatak 8 iz §4.

Dve kolone preko cele sirine, unutar iste ljuske. Basic: spisak, gore
"Ukljuceno, ne placas nista." Premium: prva stavka je "Sve iz Basic-a", pa nove
stavke GRUPISANE PO USLUZI koju je korisnik izabrao, sa imenom usluge kao
sitnim nadnaslovom. Nista sto nije kupio se ne prikazuje.

Poslednja stavka, uvek, van grupa: "Sve buduce usluge automatski na Premium-u."

TVRDO PRAVILO: Premium cena se NIKAD ne deli na broj usluga. Nikakvo "to je 375
din po usluzi". Takav broj sugerise da se Premium prodaje po usluzi i da je
neko nesto upakovao. Poruka je obrnuta i istinita: platio si jednom, vazi na
svim uslugama i na svakoj koju kasnije dodas, bez doplate.

Enterprise NIJE treca ravnopravna kartica. On je slepa ulica u toku i tice se
2% posetilaca. Ide kao tisi red ispod: "Imate 10+ lokala? Napravicemo ponudu po
meri." Klik vodi u kontakt, nikad u korak 3.

Srednji izbor unapred selektovan. Srpski, ekavica, kroz tipizirani recnik.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=36; Name='Korak 3 — fizicki proizvodi + vezivanje po stavci'; Model='Opus 5'; Effort='high'; Mode='AUTO'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.3, pa uradi
zadatak 9 iz §4.

Jedan prolaz, nikad N prolaza. Vezivanje za uslugu je osobina stavke u korpi.

Kontrola "Za koju uslugu?" ide u desni sidebar kao PRVA stavka, IZNAD
Orijentacije. Redosled prati uzrocnost: usluga odredjuje koji su sabloni uopste
dostupni, pa mora pre dizajna. Vizuelno izdvojena i obavezna.

Ako je kupljena samo jedna usluga, kontrola se NE PRIKAZUJE UOPSTE i stavka je
tiho vezana.

Ako se promeni usluga na stavci koja vec ima izabran dizajn koji za novu uslugu
ne postoji: vrati na podrazumevani sablon nove usluge i napisi jedan red zasto.
Nikad tiha promena.

Oznaka gore desno (danas "ScanMe Review · Premium · godisnje") PRESTAJE da bude
kontrola: skini strelicu, neka pise sazetak cele porudzbine ("3 usluge ·
Premium · godisnje"), klik otvara korpu. Dve kontrole koje obe pisu ime usluge
i obe izgledaju promenljivo su greska koja se dobija tiho, bez ijedne poruke.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=37; Name='Razdelnik — jedna kartica, vise usluga'; Model='Fable'; Effort='xhigh'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.4 u celini, pa
uradi zadatak 11 iz §4. Namerno ide PRE checkout-a: checkout mora da ume da
provizionira karticu vezanu za vise usluga, a to ne moze dok razdelnik ne
postoji.

Ovo je najosetljiviji task u celom nizu i razlog je jedna recenica iz RFC-a:

Memories racuna kvotu PO KARTICI STOLA. Svaki put od kartice do Memories-a MORA
da prodje kroz serverski skok koji je svestan kartice i koji kreira gosta sa
cardId te kartice. Goli klijentski link sa razdelnika na /m/[code] je ZABRANJEN:
zaobilazi granu za kreiranje gosta u convex/cards.ts, gost nastaje bez cardId,
identitet stola se gubi, kvota po stolu prestaje da postoji i model naplate
Memories-a pada.

Goli razdelnik se pravi sad — novi kod, dostupan pod /r/[cardCode] gde je kod
kartice vec u serverskom kontekstu. Njegov ulaz u Memories je serverska ruta
koja radi isti minting, pa tek onda 302 na cist /m/[code].

Razdelnik kroz Links stranicu je BLOKIRAN na vlasnikovu odluku jer bi dirao
zamrznuti Links render. Kartica ciji bi razdelnik vodio Memories kroz Links
stranicu se ODBIJA pri kreiranju, sa porukom koja navodi dva podrzana obrasca.
Greska mora da bude glasna pri kreiranju kartice, nikad tiho curenje kvote pri
skeniranju.

Test koji ovo dokazuje: skeniraj karticu razdelnika, izaberi Memories, i tvrdi
da je gost nastao SA cardId.

npm run check cist.
'@ }

@{ Id=38; Name='Korak 4 — checkout i provizioniranje'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.5, pa uradi
zadatak 10 iz §4.

Checkout pise porudzbinu sa snimkom cene, obezbedjuje nalog i plan, pa za svaku
kupljenu uslugu aktivira serviceProfiles na odgovarajucem lokalu. Nivo (tier) se
NE upisuje kao entitlement red — resava ga getEntitlement korak 3 iz TASK-29
zivo, iz plana naloga.

To je ono sto cini istinitim obecanje da Premium vazi i na svaku uslugu koju
korisnik kasnije doda, bez ijednog dodatnog upisa.

Kriterijum uspeha: posle checkout-a, getEntitlement za svaku kupljenu uslugu
vraca kupljeni nivo, izveden iz plana naloga.

Placanje je stub protiv billing port-a. Status porudzbine ide pending -> paid
rucnom admin akcijom ili kasnije webhook-om provajdera.

Za Enterprise sa mnogo lokala, provizioniranje se raspoređuje preko schedulera
i mora da bude nastavljivo, bez duplikata.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=39; Name='Landing i pricing stranica — tri paketa, brza traka'; Model='Sonnet 5'; Effort='medium'; Mode='AUTO'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.1 i §2.3.

Landing ostaje marketing, ne aplikacija. Nikakav konfigurator na landingu.
Marketinska stranica se rangira na Google-u, ekran aplikacije ne.

Gore idu TRI imenovana paketa, veliki, svaki sa imenom i jednom recenicom:
Lokal paket (Links + Meni) — "Tvoja tabla i tvoj meni. Jedan QR na stolu."
Dogadjaj paket (Venue + Memories) — "Stranica za zurku i slike koje gosti sami
naprave." Kompletan ScanMe (svih pet).

Dugme na paketu vodi PRAVO u konfigurator sa vec izabranim uslugama i planom na
srednjem izboru. Covek moze sve da promeni, ali je preskocio odlucivanje. To je
brza traka i ocekujemo da bude veliki deo konverzija.

Ispod paketa: "Ili sastavi svoje" i link u konfigurator od nule.

Sve cene dolaze iz motora iz TASK-27. Nijedan broj se ne kuca rucno u JSX.

Srpski, ekavica. ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=40; Name='Admin: tabela svih korisnika sa naplatom'; Model='Opus 5'; Effort='high'; Mode='AUTO'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.6, pa uradi
zadatak 12 iz §4.

Tabela svih korisnika je OPERATIVNO SRCE, ne spisak. Kolone ne sluze da se vidi
ko postoji, nego da vlasnik zna koga da zove danas: naziv, telefon, aktivne
usluge, plan, period, status, sledeca naplata, akcije. Podrazumevano sortirano
po sledecoj naplati — to je radna lista.

Cetiri statusa u boji, i cetvrti je najvazniji jer predvidja otkaz a nevidljiv
je ako se ne napravi: aktivan, istice za manje od 14 dana, istekao, PLACENO ALI
NIKAD PODESENO. Covek koji je platio Meni i nije uneo nijedan proizvod otkazace
za dva meseca ako ga niko ne pozove.

Ovo je NOVI upit (admin.customers), ne prosirenje postojeceg admin.listBusinesses
— taj i dalje sluzi Google Review ekran i ostaje netaknut.

Enterprise je jedan red koji se siri u svoje lokale. Solo korisnici puna sirina,
bez sidebara.

Svaka aktivacija ili promena plana pise TACNO JEDAN audit red: ko, sta, kada.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=41; Name='Admin: podstranice po uslugama, sidebar lokala, Page->Menu'; Model='Opus 5'; Effort='high'; Mode='GOAL'; Goal=@'
Procitaj docs/architecture/RFC-002-pricing-and-purchase.md §2.6, pa uradi
zadatak 13 iz §4.

Podstranice po lokalu (Links / Review / Venue / Meni) prikazuju se samo za
usluge koje su stvarno aktivne. Neaktivna usluga nema podstranicu.

Sidebar sa lokalima postoji SAMO unutar naloga sa vise lokala. Za sve ostale je
stranica pune sirine.

Oznaka "Page" se preimenuje u "Menu" iza zastavice koja se pali kad Meni kao
proizvod bude postojao. Ne pravi Meni proizvod ovde — samo kuku za preimenovanje.

ScanMe Links je zamrznut. npm run check cist.
'@ }

@{ Id=42; Name='QA: goldeni cena, pristupacnost, e2e od landinga do isteka'; Model='Fable'; Effort='ultracode'; Mode='AUTO'; Goal=@'
Poslednji task ovog niza. Procitaj docs/architecture/RFC-002-pricing-and-purchase.md
u celini, plus docs/qa/RELEASE-READINESS.md iz prethodnog kruga.

Ovo nije jos jedan test suite nego presuda: sme li se ovaj tok pustiti pred
coveka koji ce da plati.

Tri stvari koje moraju da budu dokazane, ne pretpostavljene:

Prvo — cena je ista na sva tri mesta. Marketinska stranica, server pri naplati i
faktura moraju da vrate identican broj za isti skup. Napisi test koji to tvrdi
za svih 31 podskupova. Razlika tu nije bag nego pravni problem.

Drugo — ceo put od landinga do entitlementa i do isteka. Klik na paket, cetiri
koraka, checkout, provizioniranje, pa pomeranje sata do isteka i provera da
statusi prelaze kako treba i da entitlement prestaje da vazi.

Trece — pristupacnost cetiri koraka u obe teme: kontrast, fokus, velicina meta,
red naslova, i da se ceo tok moze proci tastaturom. Nalazi u docs/qa/.

Na kraju napisi presudu u docs/qa/PURCHASE-READINESS.md: sta je dokazano, sta je
napravljeno ali nikad probano u realnim uslovima, i sta je najverovatnije da
pukne kad prvi pravi klijent bude placao. Rangirano.

ScanMe Links je zamrznut. npm run check cist.
'@ }

)

function Show-Plan {
    $Script:Tasks | ForEach-Object {
        [PSCustomObject]@{
            Task   = "TASK-$($_.Id)"
            Naziv  = $_.Name
            Model  = $_.Model
            Effort = $_.Effort
            Mode   = $_.Mode
            Chars  = $_.Goal.Length
        }
    } | Format-Table -AutoSize
}

function Get-TaskById([int]$Id) {
    $t = $Script:Tasks | Where-Object { $_.Id -eq $Id }
    if (-not $t) { Write-Error "Nema TASK-$Id. Pokreni Show-Plan."; return $null }
    return $t
}

function Show-Task([int]$Id) {
    $t = Get-TaskById $Id; if (-not $t) { return }
    Write-Host ""
    Write-Host "TASK-$($t.Id) — $($t.Name)" -ForegroundColor Green
    Write-Host "Model: $($t.Model)  |  Effort: $($t.Effort)  |  Mode: $($t.Mode)  |  Nova sesija" -ForegroundColor DarkGray
    Write-Host ("-" * 72) -ForegroundColor DarkGray
    Write-Host $t.Goal
    Write-Host ("-" * 72) -ForegroundColor DarkGray
    Write-Host "$($t.Goal.Length) karaktera" -ForegroundColor DarkGray
    Write-Host ""
}

function Copy-Task([int]$Id) {
    $t = Get-TaskById $Id; if (-not $t) { return }
    $t.Goal | Set-Clipboard
    Write-Host "TASK-$($t.Id) u clipboardu ($($t.Goal.Length) karaktera)." -ForegroundColor Green
    Write-Host "Model: $($t.Model)  |  Effort: $($t.Effort)  |  Mode: $($t.Mode)  |  Nova sesija" -ForegroundColor Yellow
}

function Test-Goals {
    $bad = $Script:Tasks | Where-Object { $_.Goal.Length -gt 4000 }
    if ($bad) {
        $bad | ForEach-Object { Write-Host "TASK-$($_.Id): $($_.Goal.Length) karaktera — PREKO 4000" -ForegroundColor Red }
    } else {
        $max = ($Script:Tasks | ForEach-Object { $_.Goal.Length } | Measure-Object -Maximum).Maximum
        Write-Host "Svi goalovi su ispod 4000 karaktera (najduzi: $max)." -ForegroundColor Green
    }
}

Write-Host "Ucitano $($Script:Tasks.Count) taskova. Komande: Show-Plan, Show-Task <br>, Copy-Task <br>, Test-Goals, Start-Chain" -ForegroundColor Cyan


# ---------------------------------------------------------------------------
# LANAC — pusta taskove jedan za drugim, bez nadzora.
#
# Bezbednosne mere, jer niko ne gleda:
#   - posle svakog taska ide "npm run check"; ako padne, lanac STAJE.
#     Greska iz TASK-27 (cenovni motor) ne sme da prodje kroz 15 narednih.
#   - svaki task je zaseban commit => tacka za povratak.
#   - sve ide u scripts/tasks/logs/ ; SUMMARY.md je prvo sto citas ujutru.
#   - agentu je zabranjeno da pravi worktree i da commituje.
# ---------------------------------------------------------------------------

$Script:ClaudeExe  = 'claude'
$Script:ClaudeArgs = @('--permission-mode','bypassPermissions')
$Script:LogDir     = Join-Path $PSScriptRoot 'logs'
$Script:Remote     = 'aleksadjor3'
$Script:Branch     = 'feat/venue-memories'
$Script:RepoRoot   = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

$Script:Preamble = @'

--- NACIN RADA (dodato automatski, vazi bez izuzetka) ---
Radi u tekucem direktorijumu. NE pravi git worktree i NE commituj nista —
skripta koja te je pokrenula commituje posle tebe.
Ako naidjes na nesto sto trazi odluku vlasnika, NE pogadjaj: zapisi pitanje u
docs/tasks/BLOCKED.md (dopisi na kraj, sa brojem taska) i nastavi sa ostatkom
zadatka.
Na kraju obavezno pokreni "npm run check" i popravi sve sto padne.
'@

function Get-ModelId([string]$Name) {
    if ($Name -match 'Sonnet') { return 'sonnet' }
    if ($Name -match 'Fable')  { return 'fable' }
    return 'opus'
}

function Start-Chain {
    param(
        [int]$From = 27,
        [int]$To   = 42,
        [switch]$WhatIf,
        [switch]$NoCheck,
        [switch]$NoPush
    )

    $list = $Script:Tasks | Where-Object { $_.Id -ge $From -and $_.Id -le $To } | Sort-Object Id
    if (-not $list) { Write-Error "Nema taskova u opsegu $From-$To."; return }

    New-Item -ItemType Directory -Force -Path $Script:LogDir | Out-Null
    $summary = Join-Path $Script:LogDir 'SUMMARY.md'
    Set-Location $Script:RepoRoot

    "# Lanac TASK-$From .. TASK-$To" | Set-Content -Path $summary -Encoding UTF8
    "Pocetak: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Add-Content -Path $summary -Encoding UTF8
    "" | Add-Content -Path $summary -Encoding UTF8

    foreach ($t in $list) {
        $model = Get-ModelId $t.Model
        $full  = $t.Goal + $Script:Preamble
        $log   = Join-Path $Script:LogDir ("task-{0}.log" -f $t.Id)

        Write-Host ""
        Write-Host "=== TASK-$($t.Id) — $($t.Name)" -ForegroundColor Green
        Write-Host "    model=$model  effort=$($t.Effort)  mode=$($t.Mode)" -ForegroundColor DarkGray

        if ($WhatIf) {
            Write-Host "    (WhatIf) $Script:ClaudeExe -p <goal $($full.Length) chars> --model $model $($Script:ClaudeArgs -join ' ')" -ForegroundColor Yellow
            continue
        }

        $started = Get-Date
        & $Script:ClaudeExe -p $full --model $model @Script:ClaudeArgs 2>&1 | Tee-Object -FilePath $log
        $agentExit = $LASTEXITCODE
        $mins = [int]((Get-Date) - $started).TotalMinutes

        if ($agentExit -ne 0) {
            git add -A | Out-Null
            git commit -m "TASK-$($t.Id): WIP — agent exit $agentExit" | Out-Null
            "- TASK-$($t.Id) $($t.Name) — **AGENT PUKAO** (exit $agentExit, ${mins}min). Lanac stao. Log: task-$($t.Id).log" | Add-Content -Path $summary -Encoding UTF8
            Write-Host "LANAC STAO na TASK-$($t.Id) (agent exit $agentExit)." -ForegroundColor Red
            return
        }

        if (-not $NoCheck) {
            $checkLog = Join-Path $Script:LogDir ("task-{0}-check.log" -f $t.Id)
            Write-Host "    npm run check ..." -ForegroundColor DarkGray
            npm run check 2>&1 | Tee-Object -FilePath $checkLog | Out-Null
            if ($LASTEXITCODE -ne 0) {
                git add -A | Out-Null
                git commit -m "TASK-$($t.Id): WIP — npm run check pao" | Out-Null
                "- TASK-$($t.Id) $($t.Name) — **CHECK PAO** (${mins}min). Lanac stao. Log: task-$($t.Id)-check.log" | Add-Content -Path $summary -Encoding UTF8
                Write-Host "LANAC STAO na TASK-$($t.Id) (npm run check pao)." -ForegroundColor Red
                return
            }
        }

        git add -A | Out-Null
        git commit -m "TASK-$($t.Id): $($t.Name)" | Out-Null
        "- TASK-$($t.Id) $($t.Name) — OK (${mins}min)" | Add-Content -Path $summary -Encoding UTF8
        Write-Host "    OK (${mins}min), commitovano." -ForegroundColor Green
    }

    if (-not $WhatIf -and -not $NoPush) {
        git push $Script:Remote $Script:Branch 2>&1 | Out-Null
        "" | Add-Content -Path $summary -Encoding UTF8
        "Push na $Script:Remote/$Script:Branch: gotovo." | Add-Content -Path $summary -Encoding UTF8
    }

    "" | Add-Content -Path $summary -Encoding UTF8
    "Kraj: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Add-Content -Path $summary -Encoding UTF8
    Write-Host ""
    Write-Host "Lanac zavrsen. Procitaj scripts\tasks\logs\SUMMARY.md" -ForegroundColor Cyan
}

