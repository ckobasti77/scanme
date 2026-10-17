// ScanMe Menu V1 — every panel primitive in every state (K07), mounted at
// /dev/menu-panel-preview?sekcija=primitivi. A server component: only the
// drawer is a client island. All data is invented.

import {
  CircleDot,
  CircleSlash,
  Eye,
  Hand,
  Lock,
  MoveVertical,
  PanelLeft,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Volume2,
  Ellipsis,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { Dugme, IkonicaDugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import { Kartica } from "../zajednicko/kartica";
import { OkvirSekcije } from "../zajednicko/okvir-sekcije";
import { MenuPovrsina } from "../zajednicko/povrsina";
import { PoljePotvrde, Prekidac } from "../zajednicko/prekidac";
import { SavObjave } from "../zajednicko/sav-objave";
import { GreskaStanje, OfflineTraka, PraznoStanje, UcitavanjeStanje } from "../zajednicko/stanja";
import { StatusOznaka, type StatusTon } from "../zajednicko/status-oznaka";
import { TrakaRadnji } from "../zajednicko/traka-radnji";
import { ZaglavljeSaStatusom } from "../zajednicko/zaglavlje-sa-statusom";

const t = menuZajednickoSr.izlog.primitivi;
const s = t.sekcije;
const p = t.primeri;

const VRSTE = ["primarno", "akcent", "sekundarno", "tiho", "opasno"] as const;

const PROIZVOD_STATUSI: readonly { ton: StatusTon; ikonica?: LucideIcon; tekst: string }[] = [
  { ton: "uspeh", tekst: p.statusObjavljeno },
  { ton: "upozorenje", ikonica: PencilLine, tekst: p.statusNacrt },
  { ton: "info", ikonica: CircleDot, tekst: p.statusNovi },
  { ton: "neutralno", ikonica: Hand, tekst: p.statusPrihvacen },
  { ton: "uspeh", tekst: p.statusZavrsen },
  { ton: "neutralno", ikonica: CircleSlash, tekst: p.statusOtkazan },
  { ton: "opasnost", tekst: p.statusGreska },
  { ton: "neutralno", ikonica: Lock, tekst: p.statusZakljucano },
];

function Red({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

export function PrimitiviPregled({ fiokaOtvorena }: { fiokaOtvorena: boolean }) {
  return (
    <div className="grid gap-10" data-primitivi="">
      <ZaglavljeSaStatusom
        kontekst={p.kontekst}
        naslov={t.naslov}
        opis={t.opis}
        radnje={
          <>
            <Dugme ikonica={Eye}>{p.pregled}</Dugme>
            <Dugme vrsta="primarno" ikonica={Upload}>
              {p.objavi}
            </Dugme>
          </>
        }
      />

      <OkvirSekcije naslov={s.dugmad} opis={s.dugmadOpis}>
        <Kartica className="grid gap-5">
          {VRSTE.map((vrsta) => (
            <Red key={vrsta}>
              <Dugme vrsta={vrsta} ikonica={vrsta === "opasno" ? Trash2 : vrsta === "akcent" ? Plus : Save}>
                {vrsta === "opasno" ? p.obrisi : vrsta === "akcent" ? p.dodajArtikal : p.sacuvaj}
              </Dugme>
              <Dugme vrsta={vrsta} disabled>
                {p.onemoguceno}
              </Dugme>
              <Dugme vrsta={vrsta} ucitava>
                {vrsta === "primarno" ? p.objavljujeSe : vrsta === "akcent" ? p.dodajeSe : vrsta === "opasno" ? p.briseSe : p.cuvaSe}
              </Dugme>
              <Dugme vrsta={vrsta} velicina="kompaktna">
                {p.izmeni}
              </Dugme>
            </Red>
          ))}
          <MenuPovrsina povrsina="konobar" className="rounded-[var(--mp-radius-unutra)] bg-transparent">
            <Red>
              <Dugme vrsta="primarno">{p.preuzmi}</Dugme>
              <Dugme>{p.zavrsi}</Dugme>
              <IkonicaDugme ikonica={Volume2} oznaka={p.zvuk} pritisnuto />
            </Red>
          </MenuPovrsina>
        </Kartica>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.ikoniceDugmad} opis={s.ikoniceDugmadOpis}>
        <Kartica>
          <Red>
            <IkonicaDugme ikonica={Ellipsis} oznaka={p.jos} />
            <IkonicaDugme ikonica={Pencil} oznaka={p.izmeni} vrsta="sekundarno" />
            <IkonicaDugme ikonica={Plus} oznaka={p.dodajArtikal} vrsta="akcent" />
            <IkonicaDugme ikonica={Upload} oznaka={p.objavi} vrsta="primarno" />
            <IkonicaDugme ikonica={Volume2} oznaka={p.zvuk} pritisnuto />
            <IkonicaDugme ikonica={Trash2} oznaka={p.obrisi} vrsta="opasno" />
            <IkonicaDugme ikonica={MoveVertical} oznaka={p.premesti} disabled />
          </Red>
        </Kartica>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.statusi} opis={s.statusiOpis}>
        <Kartica className="grid gap-4">
          <Red>
            {(["neutralno", "info", "uspeh", "upozorenje", "opasnost"] as const).map((ton) => (
              <StatusOznaka key={ton} ton={ton}>
                {ton === "neutralno"
                  ? p.statusOtkazan
                  : ton === "info"
                    ? p.statusNovi
                    : ton === "uspeh"
                      ? p.statusZavrsen
                      : ton === "upozorenje"
                        ? p.statusNacrt
                        : p.statusGreska}
              </StatusOznaka>
            ))}
          </Red>
          <Red>
            {PROIZVOD_STATUSI.map((status) => (
              <StatusOznaka key={status.tekst} ton={status.ton} ikonica={status.ikonica} velicina="mala">
                {status.tekst}
              </StatusOznaka>
            ))}
          </Red>
        </Kartica>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.zaglavlja} opis={s.zaglavljaOpis}>
        <Kartica className="grid gap-8">
          <ZaglavljeSaStatusom
            nivo={3}
            naslov={p.naslovStranice}
            status={<SavObjave objavljeno={{ broj: 12, kada: p.objavljenoKada }} neobjavljeneIzmene={3} cuvanje="cuva-se" />}
            radnje={
              <>
                <Dugme ikonica={Eye}>{p.pregled}</Dugme>
                <Dugme vrsta="primarno" ikonica={Upload}>
                  {p.objavi}
                </Dugme>
              </>
            }
          />
          <SavObjave objavljeno={{ broj: 12, kada: p.objavljenoKada }} neobjavljeneIzmene={0} cuvanje="sacuvano" />
          <SavObjave
            objavljeno={null}
            neobjavljeneIzmene={21}
            cuvanje="greska"
            akcija={
              <Dugme vrsta="tiho" velicina="kompaktna" ikonica={RotateCcw}>
                {menuZajednickoSr.stanja.pokusajPonovo}
              </Dugme>
            }
          />
        </Kartica>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.kartice} opis={s.karticeOpis}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.4fr]">
          <Kartica className="grid content-start gap-2">
            <h3 className="font-semibold">{p.karticaNaslov}</h3>
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{p.karticaTekst}</p>
          </Kartica>
          <Kartica ton="utisana">
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{p.karticaUtisana}</p>
          </Kartica>
          <Kartica ton="istaknuta" className="grid content-start gap-3">
            <h3 className="font-semibold">{p.karticaIstaknuta}</h3>
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{p.karticaIstaknutaTekst}</p>
            <Red>
              <Dugme vrsta="primarno" velicina="kompaktna">
                {p.pregled}
              </Dugme>
              <StatusOznaka ton="neutralno" ikonica={Lock} velicina="mala">
                {p.statusZakljucano}
              </StatusOznaka>
            </Red>
          </Kartica>
        </div>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.stanja} opis={s.stanjaOpis}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Kartica>
            <PraznoStanje
              nivo={3}
              naslov={p.praznoNaslov}
              opis={p.praznoOpis}
              akcija={
                <Dugme vrsta="akcent" ikonica={Plus}>
                  {p.dodajArtikal}
                </Dugme>
              }
            />
          </Kartica>
          <Kartica>
            <GreskaStanje
              nivo={3}
              naslov={p.greskaNaslov}
              akcija={<Dugme ikonica={RotateCcw}>{menuZajednickoSr.stanja.pokusajPonovo}</Dugme>}
            />
          </Kartica>
          <Kartica>
            <UcitavanjeStanje oblik="lista" redova={3} />
          </Kartica>
          <Kartica>
            <UcitavanjeStanje oblik="forma" redova={2} />
          </Kartica>
          <Kartica>
            <UcitavanjeStanje oblik="tabela" redova={3} />
          </Kartica>
          <Kartica>
            <UcitavanjeStanje oblik="kartice" redova={2} />
          </Kartica>
        </div>
        <OfflineTraka vreme={p.offlineVreme} />
      </OkvirSekcije>

      <OkvirSekcije naslov={s.kontrole} opis={s.kontroleOpis}>
        <Kartica className="grid gap-2 sm:grid-cols-2 sm:gap-x-8">
          <Prekidac naziv={p.prekidacNaziv} opis={p.prekidacOpis} defaultChecked />
          <Prekidac naziv={p.prekidacNaziv} opis={p.prekidacOpis} />
          <Prekidac
            naziv={p.prekidacIskljucenNaziv}
            opis={p.prekidacIskljucenOpis}
            oznaka={
              <StatusOznaka ton="neutralno" ikonica={Lock} velicina="mala">
                {p.statusZakljucano}
              </StatusOznaka>
            }
            disabled
          />
          <PoljePotvrde naziv={p.potvrdaNaziv} opis={p.potvrdaOpis} defaultChecked />
          <PoljePotvrde naziv={p.potvrdaNaziv} />
          <PoljePotvrde naziv={p.potvrdaNaziv} greska={p.potvrdaGreska} />
        </Kartica>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.fioka} opis={s.fiokaOpis}>
        <Kartica>
          <Fioka
            podrazumevanoOtvoreno={fiokaOtvorena}
            naslov={p.fiokaNaslov}
            opis={p.fiokaOpis}
            okidac={<Dugme ikonica={PanelLeft}>{p.fiokaOtvori}</Dugme>}
            podnozje={
              <Dugme vrsta="akcent" ikonica={Plus} velicina="kompaktna">
                {p.dodajArtikal}
              </Dugme>
            }
          >
            <ul className="grid gap-1">
              {p.fiokaStavke.map((stavka, index) => (
                <li key={stavka}>
                  <button
                    type="button"
                    aria-current={index === 0 ? "true" : undefined}
                    className="flex min-h-[var(--mp-meta)] w-full cursor-pointer items-center rounded-[var(--mp-radius-kontrola)] px-3 font-medium hover:bg-[var(--mp-povrsina-utisana)] aria-[current=true]:bg-[var(--mp-akcent-meko)] aria-[current=true]:font-semibold aria-[current=true]:shadow-[inset_3px_0_0_var(--mp-mastilo)]"
                  >
                    {stavka}
                  </button>
                </li>
              ))}
            </ul>
          </Fioka>
        </Kartica>
      </OkvirSekcije>

      <OkvirSekcije naslov={s.trakaRadnji} opis={s.trakaRadnjiOpis}>
        <Kartica>
          <TrakaRadnji oznaka={p.trakaOznaka}>
            <Dugme vrsta="tiho">{p.otkazi}</Dugme>
            <Dugme vrsta="primarno" ikonica={Save}>
              {p.sacuvaj}
            </Dugme>
          </TrakaRadnji>
        </Kartica>
        <TrakaRadnji oznaka={p.trakaOznaka} pozicija="dno" poravnanje="razmaknuto">
          <IkonicaDugme ikonica={MoveVertical} oznaka={p.premesti} vrsta="sekundarno" />
          <div className="flex gap-2">
            <IkonicaDugme ikonica={Trash2} oznaka={p.obrisi} vrsta="opasno" />
            <Dugme vrsta="primarno" ikonica={Save} velicina="kompaktna">
              {p.sacuvaj}
            </Dugme>
          </div>
        </TrakaRadnji>
      </OkvirSekcije>
    </div>
  );
}
