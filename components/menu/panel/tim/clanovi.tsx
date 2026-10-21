"use client";

// ScanMe Menu V1 (K28) — the card "Članovi tima" and the block "Šta svaka uloga
// sme" of Tim i pristupi (plan docs/meni/planovi/K24.md §4.6). The members come in
// two groups: people from the ScanMe account (Vlasnik, Menadžer — shown only, never
// changed here) and the people invited into ScanMe Menu (pending, expired or
// active), who can get another role or be removed. What a row allows is decided by
// `smeUpravljati`, the same rule Convex enforces: nobody touches their own row and
// a Menadžer never gives, changes or removes the Owner role; the disabled action
// says why. The rights listed for each role are `pravaUloge`, read from the one
// permission matrix.

import { Building2, Check, Mail, PenLine, Send, ShieldCheck, UserCog, UserMinus, UserPlus, X, type LucideIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { formatBelgradeDate } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { roleCan, type MenuActor, type MenuRole } from "@/lib/menu/permissions";
import {
  pravaUloge,
  PRAVA,
  smeUpravljati,
  statusClana,
  TIM_ULOGE,
  ulogeZaPoziv,
  type ClanStatus,
  type PravoKljuc,
} from "@/lib/menu/team-view";
import { cn } from "@/lib/utils";
import { POLJE_KLASA, Polje, PorukaGreske, Potvrda } from "../../lokal/zajednicko";
import { StudioDijalog } from "../../studio/dijalog";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { StatusOznaka, type StatusTon } from "../../zajednicko/status-oznaka";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";
import type { TimClan, TimNalogClan, TimPodaci, TimRadnje } from "./model";
import type { PozivnicaPreset } from "./pozivnica";

const tim = menuPanelSr.tim;
const t = tim.clanovi;

const STATUS_TON: Record<ClanStatus, StatusTon> = { aktivan: "uspeh", pozvan: "info", istekao: "upozorenje" };
const STATUS_TEKST: Record<ClanStatus, string> = {
  aktivan: t.statusAktivan,
  pozvan: t.statusPozvan,
  istekao: t.statusIstekao,
};

const ULOGA_IKONICA: Record<MenuRole, LucideIcon> = {
  owner: ShieldCheck,
  manager: ShieldCheck,
  editor: PenLine,
};

/** Every right a role can have, in the order of PRAVA; `vlasnistvo` last. */
const SVA_PRAVA: readonly PravoKljuc[] = [...PRAVA.map((pravo) => pravo.kljuc), "vlasnistvo"];

const LISTA_KLASA = "grid [--border:var(--mp-ivica)]";
const RED_KLASA = "flex flex-wrap items-center gap-x-4 gap-y-3 border-t py-3.5 first:border-t-0 first:pt-0 last:pb-0";
// A member row of the second list: the <li> carries the separator and the padding, the inner row only lays out.
const CLAN_LI_KLASA = "border-t py-3.5 first:border-t-0 first:pt-0 last:pb-0";
const CLAN_RED_KLASA = "flex flex-wrap items-center gap-x-4 gap-y-3";

/** Name, e-mail and the "Vi" mark of a person; both groups of members start their row like this. */
function Osoba({ ime, email, vi }: { ime: string; email: string | null; vi: boolean }) {
  return (
    <div className="min-w-0 flex-1 basis-56">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold leading-snug text-[var(--mp-tekst)]">
        <span className="min-w-0 [overflow-wrap:anywhere]">{ime}</span>
        {vi ? (
          <StatusOznaka ton="info" velicina="mala">
            {t.vi}
          </StatusOznaka>
        ) : null}
      </p>
      {email !== null && email !== ime ? (
        <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)] [overflow-wrap:anywhere]">{email}</p>
      ) : null}
    </div>
  );
}

function NalogRed({ clan }: { clan: TimNalogClan }) {
  return (
    <li data-nalog-clan={clan.key} className={RED_KLASA}>
      <Osoba ime={clan.name ?? clan.email ?? t.bezImena} email={clan.email} vi={clan.isSelf} />
      <div className="flex flex-wrap items-center gap-2">
        <StatusOznaka ton="neutralno" velicina="mala" ikonica={ULOGA_IKONICA[clan.role]}>
          {tim.uloge[clan.role].naziv}
        </StatusOznaka>
        <StatusOznaka ton="neutralno" velicina="mala" ikonica={Building2}>
          {t.izNaloga}
        </StatusOznaka>
      </div>
    </li>
  );
}

type PotvrdaVrsta = { id: string; vrsta: "ukloni" | "opozovi" };

function ClanRed({
  clan,
  actor,
  sada,
  zauzeto,
  potvrda,
  onPotvrda,
  onUloga,
  onPonovo,
  onPotvrdi,
}: {
  clan: TimClan;
  actor: MenuActor;
  sada: number;
  zauzeto: boolean;
  potvrda: PotvrdaVrsta | null;
  onPotvrda: (potvrda: PotvrdaVrsta | null) => void;
  onUloga: (clan: TimClan) => void;
  onPonovo: (clan: TimClan) => void;
  onPotvrdi: (potvrda: PotvrdaVrsta) => void;
}) {
  const razlogId = useId();
  const status = statusClana(clan, sada);
  const ime = clan.name ?? clan.email;
  const mozeTim = roleCan(actor, "team.manage");
  const sme = smeUpravljati(actor, clan.role, { svoj: clan.isSelf });
  const razlog = !mozeTim || clan.isSelf ? null : sme ? null : t.samoVlasnik;
  const rok =
    clan.inviteExpiresAt === null || status === "aktivan"
      ? null
      : fmt(status === "istekao" ? t.isteklo : t.istice, { datum: formatBelgradeDate(clan.inviteExpiresAt) });
  const onemoguceno = !sme || zauzeto;
  const opis = razlog !== null ? razlogId : undefined;
  const aktivnaPotvrda = potvrda !== null && potvrda.id === clan.id ? potvrda : null;

  return (
    <li data-clan={clan.id} data-clan-status={status} className={CLAN_LI_KLASA}>
      <div className={CLAN_RED_KLASA}>
        <Osoba ime={ime} email={clan.name !== null ? clan.email : null} vi={clan.isSelf} />
        <div className="flex flex-wrap items-center gap-2">
          <StatusOznaka ton="neutralno" velicina="mala" ikonica={ULOGA_IKONICA[clan.role]}>
            {tim.uloge[clan.role].naziv}
          </StatusOznaka>
          <StatusOznaka ton={STATUS_TON[status]} velicina="mala" ikonica={status === "pozvan" || status === "istekao" ? Mail : undefined}>
            {STATUS_TEKST[status]}
          </StatusOznaka>
          {rok !== null ? <span className="text-sm text-[var(--mp-tekst-sporedni)]">{rok}</span> : null}
        </div>

        {clan.isSelf ? (
          <p className="basis-full text-sm text-[var(--mp-tekst-sporedni)]">{t.svojRed}</p>
        ) : mozeTim ? (
          <div className="grid basis-full gap-1.5">
            <div role="group" aria-label={fmt(t.radnje, { ime })} className="flex flex-wrap items-center gap-2">
              {status === "aktivan" ? (
                <>
                  <Dugme
                    vrsta="sekundarno"
                    velicina="kompaktna"
                    ikonica={UserCog}
                    disabled={onemoguceno}
                    aria-describedby={opis}
                    onClick={() => onUloga(clan)}
                  >
                    {t.promeniUlogu}
                  </Dugme>
                  <Dugme
                    vrsta="opasno"
                    velicina="kompaktna"
                    ikonica={UserMinus}
                    disabled={onemoguceno}
                    aria-describedby={opis}
                    onClick={() => onPotvrda({ id: clan.id, vrsta: "ukloni" })}
                  >
                    {t.ukloni}
                  </Dugme>
                </>
              ) : (
                <>
                  {status === "istekao" ? (
                    <Dugme
                      vrsta="sekundarno"
                      velicina="kompaktna"
                      ikonica={Send}
                      disabled={onemoguceno}
                      aria-describedby={opis}
                      onClick={() => onPonovo(clan)}
                    >
                      {t.ponoviPoziv}
                    </Dugme>
                  ) : null}
                  <Dugme
                    vrsta="opasno"
                    velicina="kompaktna"
                    ikonica={X}
                    disabled={onemoguceno}
                    aria-describedby={opis}
                    onClick={() => onPotvrda({ id: clan.id, vrsta: "opozovi" })}
                  >
                    {t.opozovi}
                  </Dugme>
                </>
              )}
            </div>
            {razlog !== null ? (
              <p id={razlogId} className="text-sm text-[var(--mp-tekst-sporedni)]">
                {razlog}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {aktivnaPotvrda ? (
        <div className="pt-3">
          <Potvrda
            tekst={
              aktivnaPotvrda.vrsta === "ukloni"
                ? `${t.ukloniNaslov} ${fmt(t.ukloniOpis, { ime })}`
                : `${t.opozoviNaslov} ${fmt(t.opozoviOpis, { ime })}`
            }
            potvrdi={aktivnaPotvrda.vrsta === "ukloni" ? t.ukloniPotvrdi : t.opozoviPotvrdi}
            odustani={t.odustani}
            radi={zauzeto}
            onPotvrdi={() => onPotvrdi(aktivnaPotvrda)}
            onOdustani={() => onPotvrda(null)}
          />
        </div>
      ) : null}
    </li>
  );
}

/** The dialog "Promena uloge": the roles the actor may give, saved with its own error under the field. */
function PromenaUloge({
  actor,
  clan,
  promeni,
  onZatvori,
}: {
  actor: MenuActor;
  clan: TimClan;
  promeni: (memberId: string, uloga: MenuRole) => Promise<SacuvajIshod>;
  onZatvori: () => void;
}) {
  const id = useId();
  const { faza, kod, pokreni } = useCuvanje();
  const [uloga, setUloga] = useState<MenuRole>(clan.role);
  const ime = clan.name ?? clan.email;
  const formId = `${id}-forma`;

  const sacuvaj = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ishod = await pokreni(() => promeni(clan.id, uloga));
    if (ishod?.ok) onZatvori();
  };

  return (
    <StudioDijalog
      otvoreno
      onOtvoreno={(otvoreno) => (otvoreno ? undefined : onZatvori())}
      naslov={t.ulogaNaslov}
      opis={fmt(t.ulogaOpis, { ime })}
      podnozje={
        <>
          <Dugme vrsta="sekundarno" onClick={onZatvori}>
            {t.odustani}
          </Dugme>
          <Dugme type="submit" form={formId} vrsta="primarno" ucitava={faza === "cuva"}>
            {faza === "cuva" ? t.cuva : t.sacuvaj}
          </Dugme>
        </>
      }
    >
      <form id={formId} onSubmit={sacuvaj} className="grid gap-4">
        <Polje id={`${id}-uloga`} oznaka={tim.pozivnica.uloga}>
          {(aria) => (
            <select
              {...aria}
              value={uloga}
              onChange={(event) => setUloga(event.target.value as MenuRole)}
              className={cn(POLJE_KLASA, "cursor-pointer")}
            >
              {ulogeZaPoziv(actor).map((moguca) => (
                <option key={moguca} value={moguca}>
                  {tim.uloge[moguca].naziv}
                </option>
              ))}
            </select>
          )}
        </Polje>
        <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{tim.uloge[uloga].opis}</p>
        {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
      </form>
    </StudioDijalog>
  );
}

export function Clanovi({
  actor,
  sada,
  clanovi,
  radnje,
  onPozovi,
}: {
  actor: MenuActor;
  sada: number;
  /** undefined while loading. */
  clanovi: TimPodaci["clanovi"];
  radnje: Pick<TimRadnje, "promeniUlogu" | "ukloni" | "opozovi">;
  /** Opens "Pozovi člana"; `preset` fills it for a new invitation to the same person. */
  onPozovi: (preset?: PozivnicaPreset) => void;
}) {
  const { faza, kod, pokreni } = useCuvanje();
  const [potvrda, setPotvrda] = useState<PotvrdaVrsta | null>(null);
  const [uloga, setUloga] = useState<TimClan | null>(null);
  const mozePozvati = ulogeZaPoziv(actor).length > 0;

  const potvrdi = async (izabrano: PotvrdaVrsta) => {
    const ishod = await pokreni(() =>
      izabrano.vrsta === "ukloni" ? radnje.ukloni(izabrano.id) : radnje.opozovi(izabrano.id),
    );
    if (ishod?.ok) setPotvrda(null);
  };

  return (
    <Kartica data-clanovi="">
      <OkvirSekcije
        naslov={t.naslov}
        opis={t.opis}
        nivo={2}
        radnje={
          mozePozvati ? (
            <Dugme vrsta="akcent" ikonica={UserPlus} onClick={() => onPozovi()}>
              {t.pozovi}
            </Dugme>
          ) : undefined
        }
      >
        {clanovi === undefined ? (
          <UcitavanjeStanje oblik="lista" redova={3} oznaka={tim.ucitavanje} />
        ) : (
          <div className="grid gap-6">
            {clanovi.account.length > 0 ? (
              <div className="grid gap-3">
                <ul className={LISTA_KLASA}>
                  {clanovi.account.map((clan) => (
                    <NalogRed key={clan.key} clan={clan} />
                  ))}
                </ul>
                <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.izNalogaPomoc}</p>
              </div>
            ) : null}

            <OkvirSekcije naslov={t.pozvaniNaslov} nivo={3}>
              {clanovi.members.length === 0 ? (
                <p data-clanovi-prazno="" className="rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] px-3 py-3 text-sm leading-relaxed text-[var(--mp-tekst)]">
                  {t.prazno}
                </p>
              ) : (
                <ul className={LISTA_KLASA}>
                  {clanovi.members.map((clan) => (
                    <ClanRed
                      key={clan.id}
                      clan={clan}
                      actor={actor}
                      sada={sada}
                      zauzeto={faza === "cuva"}
                      potvrda={potvrda}
                      onPotvrda={setPotvrda}
                      onUloga={setUloga}
                      onPonovo={(izabran) => onPozovi({ email: izabran.email, uloga: izabran.role })}
                      onPotvrdi={(izabrano) => void potvrdi(izabrano)}
                    />
                  ))}
                </ul>
              )}
            </OkvirSekcije>

            <div className="grid gap-2">
              <CuvanjeStatus faza={faza} cuva={t.cuva} sacuvano={t.sacuvano} />
              {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
            </div>
          </div>
        )}
      </OkvirSekcije>

      {uloga ? (
        <PromenaUloge actor={actor} clan={uloga} promeni={radnje.promeniUlogu} onZatvori={() => setUloga(null)} />
      ) : null}
    </Kartica>
  );
}

/** "Šta svaka uloga sme": for every role its name, one sentence and the rights it holds. */
export function UlogeObjasnjenje() {
  return (
    <Kartica data-uloge="">
      <OkvirSekcije naslov={tim.pravaNaslov} opis={tim.pravaOpis} nivo={2}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TIM_ULOGE.map((uloga) => {
            const ima = pravaUloge(uloga);
            const nema = SVA_PRAVA.filter((pravo) => !ima.includes(pravo));
            return (
              <article
                key={uloga}
                data-uloga-red={uloga}
                className="grid content-start gap-3 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] p-4"
              >
                <div className="grid gap-1">
                  <h3 className="text-base font-semibold leading-snug text-[var(--mp-tekst)]">{tim.uloge[uloga].naziv}</h3>
                  <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{tim.uloge[uloga].opis}</p>
                </div>
                <div className="grid gap-1.5">
                  <p className="text-sm font-medium text-[var(--mp-tekst)]">{tim.sme}</p>
                  <ul data-sme="" className="grid gap-1.5">
                    {ima.map((pravo) => (
                      <li key={pravo} className="flex items-start gap-2 text-sm leading-snug text-[var(--mp-tekst)]">
                        <Check aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
                        <span className="min-w-0">{tim.prava[pravo]}</span>
                        {pravo === "vlasnistvo" ? (
                          <StatusOznaka ton="info" velicina="mala">
                            {tim.samoVlasnik}
                          </StatusOznaka>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
                {nema.length > 0 ? (
                  <div className="grid gap-1.5">
                    <p className="text-sm font-medium text-[var(--mp-tekst)]">{tim.nesme}</p>
                    <ul data-nesme="" className="grid gap-1.5">
                      {nema.map((pravo) => (
                        <li key={pravo} className="flex items-start gap-2 text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
                          <X aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
                          <span className="min-w-0">{tim.prava[pravo]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </OkvirSekcije>
    </Kartica>
  );
}
