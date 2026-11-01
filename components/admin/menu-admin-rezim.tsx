"use client";

// K28 — INTERNAL ScanMe admin tool for the new Menu model: "Režim usluge"
// (the mode is chosen at creation, the client only SEES it, only the admin
// changes it, after seeing what the change switches off — master §4.1/§4.2)
// and "Uvoz u nacrt (novi model)" (dry-run check, then import into an empty
// draft; never publishes). Presentational: props only, no Convex. The wiring
// to convex/menuServices.ts adminSetMode and convex/menuAdmin.ts
// importDraftV2 lives in components/admin/menu-admin-subpage.tsx; the dev
// fixture in app/dev/menu-admin-preview feeds it fake handlers.

import { LoaderCircle, TriangleAlert, Upload, X } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBelgrade } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n";
import { menuAdminSr as dict } from "@/lib/i18n/sr/menu-admin";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import {
  featuresDroppedByModeChange,
  isModeAvailable,
  MENU_MODES,
  type MenuFeatureKey,
  type MenuMode,
} from "@/lib/menu/modes";

export type RezimFeatureValue = boolean | "off" | "form" | "external";

export type RezimUsluga = {
  mode: MenuMode;
  modeSetAt: number | null;
  features: Record<MenuFeatureKey, RezimFeatureValue>;
};

export type RezimIshod =
  | { ok: true; changed: boolean; droppedFeatures: string[] }
  | { ok: false; poruka: string };

export type UvozIshod =
  | {
      ok: true;
      imported: boolean;
      grupe: number;
      artikli: number;
      upozorenja: number;
      duplikati: number;
      blokade: string[];
      uvezeno?: number;
    }
  | { ok: false; poruka: string };

export type MenuAdminRezimProps = {
  usluga: RezimUsluga | null;
  /** Venue name; the admin types it to confirm a mode change. */
  lokal: string;
  onPromeni: (mode: MenuMode) => Promise<RezimIshod>;
  onProveri: (json: string) => Promise<UvozIshod>;
  onUvezi: (json: string) => Promise<UvozIshod>;
  /** Opens/highlights one card on the first render (dev fixture, tests). */
  pocetniModal?: "rezim" | "uvoz" | null;
  /** Fixture only: text and check result the import card starts with. */
  pocetniTekst?: string;
  pocetniProvera?: UvozIshod | null;
};

const MODE_LABEL: Record<MenuMode, string> = menuDomenSr.modes;
const FEATURE_LABEL = dict.rezimFunkcije as Record<string, string>;

function isFeatureOn(value: RezimFeatureValue | undefined): boolean {
  return value !== undefined && value !== false && value !== "off";
}

function featureNames(keys: readonly string[]): string {
  return keys.map((key) => FEATURE_LABEL[key] ?? key).join(", ");
}

const CARD_CLASS = "mt-6 border-t border-border/60 pt-5";
const HIGHLIGHT_CLASS = "-mx-2 rounded-sm px-2 ring-2 ring-primary/50";

// -----------------------------------------------------------------------------
// Režim usluge
// -----------------------------------------------------------------------------

/** Body of the confirm dialog: notice, what gets switched off, typed name. */
export function RezimDijalogTelo({
  trenutni,
  cilj,
  features,
  lokal,
  uneto,
  onUneto,
  poruka,
  busy = false,
  onPotvrdi,
  onOdustani,
}: {
  trenutni: MenuMode;
  cilj: MenuMode;
  features: Record<MenuFeatureKey, RezimFeatureValue>;
  lokal: string;
  uneto: string;
  onUneto: (value: string) => void;
  poruka: string | null;
  busy?: boolean;
  onPotvrdi: () => void;
  onOdustani: () => void;
}) {
  const id = useId();
  const dropped = featuresDroppedByModeChange(trenutni, cilj);
  const matches = uneto.trim() === lokal.trim() && lokal.trim() !== "";
  return (
    <div className="grid gap-4">
      <div
        className="grid gap-1.5 rounded-lg border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 text-sm leading-6 text-[var(--admin-text)]"
        role="note"
      >
        <p className="flex items-start gap-2 font-bold">
          <TriangleAlert
            aria-hidden="true"
            strokeWidth={2}
            className="mt-1 size-4 shrink-0 text-[var(--admin-warning)]"
          />
          <span className="min-w-0">{dict.rezimUpozorenje}</span>
        </p>
        <p>{menuDomenSr.modeChangeNotice}</p>
      </div>
      <p className="text-sm font-semibold">
        {MODE_LABEL[trenutni]} → {MODE_LABEL[cilj]}
      </p>
      <div>
        {dropped.length > 0 ? (
          <>
            <p className="text-sm text-[var(--admin-text-muted)]">{dict.rezimGase}</p>
            <ul className="mt-2 grid gap-1.5 text-sm">
              {dropped.map((key) => (
                <li key={key} className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{FEATURE_LABEL[key] ?? key}</span>
                  {isFeatureOn(features[key]) ? (
                    <span className="rounded-sm border border-destructive/50 px-2 text-xs text-destructive">
                      {dict.rezimUkljucena}
                    </span>
                  ) : (
                    <span className="rounded-sm border border-[var(--admin-border)] px-2 text-xs text-[var(--admin-text-muted)]">
                      {dict.rezimVecIskljucena}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-[var(--admin-text-muted)]">{dict.rezimNistaSeNeGasi}</p>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-potvrda`}>
          {fmt(dict.rezimPotvrdaOznaka, { naziv: lokal })}
        </Label>
        <Input
          id={`${id}-potvrda`}
          value={uneto}
          onChange={(event) => onUneto(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-pomoc`}
          className="min-h-11"
        />
        <p id={`${id}-pomoc`} className="text-xs text-[var(--admin-text-muted)]">
          {dict.rezimPotvrdaPomoc}
        </p>
      </div>
      {poruka ? (
        <p className="text-sm font-semibold text-destructive" role="alert">
          {poruka}
        </p>
      ) : null}
      {/* A bar of its own: on a short screen the body scrolls under it and the buttons stay in reach. */}
      <DialogFooter className="sticky bottom-0 z-10 -mx-6 border-t border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-6 py-4">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={onOdustani}
        >
          {dict.rezimOdustani}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={!matches || busy}
          onClick={onPotvrdi}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {dict.rezimPotvrdi}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function RezimKartica({
  usluga,
  lokal,
  onPromeni,
  pocetniModal,
}: Pick<MenuAdminRezimProps, "usluga" | "lokal" | "onPromeni" | "pocetniModal">) {
  const id = useId();
  const forced = pocetniModal === "rezim" && usluga !== null;
  const [target, setTarget] = useState<MenuMode | null>(() =>
    forced && usluga
      ? (MENU_MODES.find((mode) => mode !== usluga.mode) ?? usluga.mode)
      : null,
  );
  const [open, setOpen] = useState(forced);
  const [uneto, setUneto] = useState("");
  const [busy, setBusy] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);
  const [uspeh, setUspeh] = useState<string | null>(null);

  const headingId = `${id}-naslov`;
  const header = (
    <>
      <h3 id={headingId} className="text-base font-semibold">
        {dict.rezimNaslov}
      </h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        {dict.rezimOpis}
      </p>
    </>
  );

  if (!usluga) {
    return (
      <section className={CARD_CLASS} aria-labelledby={headingId}>
        {header}
        <p className="mt-3 text-sm text-muted-foreground">{dict.rezimNemaUsluge}</p>
      </section>
    );
  }

  const current = usluga.mode;
  const selected = target ?? current;
  const canChange = selected !== current && isModeAvailable(selected);
  const matches = uneto.trim() === lokal.trim() && lokal.trim() !== "";

  async function confirm() {
    if (!matches || busy) return;
    setBusy(true);
    setGreska(null);
    let result: RezimIshod;
    try {
      result = await onPromeni(selected);
    } catch {
      result = { ok: false, poruka: dict.rezimGreska };
    }
    setBusy(false);
    if (!result.ok) {
      setGreska(result.poruka);
      return;
    }
    setOpen(false);
    setUneto("");
    setUspeh(
      !result.changed
        ? dict.rezimBezPromene
        : result.droppedFeatures.length > 0
          ? fmt(dict.rezimUspeh, { funkcije: featureNames(result.droppedFeatures) })
          : dict.rezimUspehBezGasenja,
    );
  }

  return (
    <section
      className={`${CARD_CLASS} ${pocetniModal === "rezim" && !open ? HIGHLIGHT_CLASS : ""}`}
      aria-labelledby={headingId}
    >
      {header}
      <dl className="mt-4 text-sm">
        <dt className="text-muted-foreground">{dict.rezimTrenutni}</dt>
        <dd className="font-semibold">{MODE_LABEL[current]}</dd>
        {usluga.modeSetAt !== null ? (
          <dd className="text-muted-foreground">
            {fmt(dict.rezimPostavljen, { datum: formatBelgrade(usluga.modeSetAt) })}
          </dd>
        ) : null}
      </dl>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-sm font-medium">{dict.rezimIzbor}</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {MENU_MODES.map((mode) => {
            const unavailable = !isModeAvailable(mode) && mode !== current;
            const reasonId = `${id}-razlog-${mode}`;
            const reason =
              !isModeAvailable(mode) && mode !== "hospitality"
                ? dict.rezimNedostupno[mode as "services" | "retail"]
                : null;
            return (
              <label
                key={mode}
                className={
                  "flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-1 border px-3 py-2 text-sm " +
                  (unavailable
                    ? "cursor-not-allowed border-border text-muted-foreground"
                    : "cursor-pointer border-border has-[:checked]:border-primary has-[:checked]:bg-primary/10")
                }
              >
                <input
                  type="radio"
                  name={`${id}-rezim`}
                  value={mode}
                  checked={selected === mode}
                  disabled={unavailable || busy}
                  onChange={() => {
                    setTarget(mode);
                    setUspeh(null);
                  }}
                  aria-describedby={unavailable && reason ? reasonId : undefined}
                  className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
                <span className="font-medium">{MODE_LABEL[mode]}</span>
                {unavailable && reason ? (
                  <span
                    id={reasonId}
                    className="ml-auto shrink-0 whitespace-nowrap border border-border px-2 text-xs"
                  >
                    {reason}
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!canChange && !(forced && selected !== current)}
          aria-describedby={selected === current ? `${id}-isti` : undefined}
          onClick={() => {
            setGreska(null);
            setUspeh(null);
            setOpen(true);
          }}
        >
          {dict.rezimPromeni}
        </Button>
        {selected === current ? (
          <p id={`${id}-isti`} className="text-sm text-muted-foreground">
            {dict.rezimIzaberiDrugi}
          </p>
        ) : null}
      </div>
      {uspeh ? (
        <p className="mt-3 text-sm font-semibold" role="status">
          {uspeh}
        </p>
      ) : null}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          setOpen(next);
          if (!next) setUneto("");
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="admin-v1 max-h-[calc(100dvh-2rem)] overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] pb-0 text-[var(--admin-text)]"
        >
          <DialogHeader className="pr-12">
            <DialogTitle>{dict.rezimDijalogNaslov}</DialogTitle>
            <DialogDescription className="sr-only">{dict.rezimOpis}</DialogDescription>
          </DialogHeader>
          <DialogClose
            aria-label={dict.rezimOdustani}
            className="absolute right-2 top-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm opacity-80 transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"
          >
            <X aria-hidden="true" className="size-4" />
          </DialogClose>
          <RezimDijalogTelo
            trenutni={current}
            cilj={selected}
            features={usluga.features}
            lokal={lokal}
            uneto={uneto}
            onUneto={setUneto}
            poruka={greska}
            busy={busy}
            onPotvrdi={() => void confirm()}
            onOdustani={() => {
              setOpen(false);
              setUneto("");
            }}
          />
        </DialogContent>
      </Dialog>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Uvoz u nacrt (novi model)
// -----------------------------------------------------------------------------

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

const ISSUE_TEXT = menuDomenSr.migrationIssues as Record<string, string | undefined>;

export function UvozKartica({
  onProveri,
  onUvezi,
  pocetniModal,
  pocetniTekst,
  pocetniProvera,
}: Pick<
  MenuAdminRezimProps,
  "onProveri" | "onUvezi" | "pocetniModal" | "pocetniTekst" | "pocetniProvera"
>) {
  const id = useId();
  const [tekst, setTekst] = useState(pocetniTekst ?? "");
  const [provera, setProvera] = useState<UvozIshod | null>(pocetniProvera ?? null);
  const [provereniTekst, setProvereniTekst] = useState<string | null>(
    pocetniProvera && pocetniProvera.ok && pocetniProvera.blokade.length === 0
      ? (pocetniTekst ?? null)
      : null,
  );
  const [busy, setBusy] = useState<"proveri" | "uvezi" | null>(null);
  const [greska, setGreska] = useState<string | null>(null);
  const [uspeh, setUspeh] = useState<string | null>(null);

  function promeniTekst(value: string) {
    setTekst(value);
    setUspeh(null);
    setGreska(null);
  }

  async function pokreni(kind: "proveri" | "uvezi") {
    if (busy) return;
    setGreska(null);
    setUspeh(null);
    if (!isValidJson(tekst)) {
      setGreska(dict.uvozNeispravan);
      return;
    }
    setBusy(kind);
    let result: UvozIshod;
    try {
      result = await (kind === "proveri" ? onProveri(tekst) : onUvezi(tekst));
    } catch {
      result = { ok: false, poruka: dict.uvozGreska };
    }
    setBusy(null);
    if (!result.ok) {
      setGreska(result.poruka);
      if (kind === "proveri") {
        setProvera(null);
        setProvereniTekst(null);
      }
      return;
    }
    if (kind === "uvezi" && result.imported) {
      setUspeh(fmt(dict.uvozUspeh, { artikli: result.uvezeno ?? result.artikli }));
      setProvera(null);
      setProvereniTekst(null);
      return;
    }
    setProvera(result);
    setProvereniTekst(result.blokade.length === 0 ? tekst : null);
  }

  const headingId = `${id}-naslov`;
  const uvoziva = provereniTekst !== null && provereniTekst === tekst;
  const povezano = [`${id}-pomoc`, greska ? `${id}-greska` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={`${CARD_CLASS} ${pocetniModal === "uvoz" ? HIGHLIGHT_CLASS : ""}`}
      aria-labelledby={headingId}
    >
      <h3 id={headingId} className="text-base font-semibold">
        {dict.uvozNaslov}
      </h3>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
        {dict.uvozOpis}
      </p>
      <div className="mt-3 grid gap-1.5">
        <Label htmlFor={`${id}-tekst`}>{dict.uvozPolje}</Label>
        <Textarea
          id={`${id}-tekst`}
          value={tekst}
          onChange={(event) => promeniTekst(event.target.value)}
          spellCheck={false}
          aria-describedby={povezano}
          aria-invalid={greska === dict.uvozNeispravan ? true : undefined}
          className="min-h-48 font-mono text-sm"
        />
        <p id={`${id}-pomoc`} className="text-xs text-muted-foreground">
          {dict.uvozPomoc}
        </p>
      </div>
      {greska ? (
        <p
          id={`${id}-greska`}
          className="mt-2 text-sm font-semibold text-destructive"
          role="alert"
        >
          {greska}
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={busy !== null || tekst.trim() === ""}
          onClick={() => void pokreni("proveri")}
        >
          {busy === "proveri" ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : null}
          {busy === "proveri" ? dict.uvozRadi : dict.uvozProveri}
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={busy !== null || !uvoziva}
          onClick={() => void pokreni("uvezi")}
        >
          {busy === "uvezi" ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Upload className="size-4" aria-hidden="true" />
          )}
          {busy === "uvezi" ? dict.uvozRadi : dict.uvozUvezi}
        </Button>
      </div>

      <div aria-live="polite">
        {provera && provera.ok ? (
          <div className="mt-4 grid gap-1 text-sm">
            <p className="font-semibold">
              {fmt(dict.uvozIzvestaj, { grupe: provera.grupe, artikli: provera.artikli })}
            </p>
            <p className="text-muted-foreground">
              {fmt(dict.uvozUpozorenja, {
                upozorenja: provera.upozorenja,
                duplikati: provera.duplikati,
              })}
            </p>
            {provera.blokade.length > 0 ? (
              <div className="mt-1">
                <p className="font-semibold text-destructive">{dict.uvozBlokirano}</p>
                <ul className="mt-1 list-disc pl-5">
                  {provera.blokade.map((code) => (
                    <li key={code}>{ISSUE_TEXT[code] ?? code}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-1 font-semibold">{dict.uvozSpremno}</p>
            )}
          </div>
        ) : null}
        {uspeh ? (
          <p className="mt-4 text-sm font-semibold" role="status">
            {uspeh}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function MenuAdminRezim({
  usluga,
  lokal,
  onPromeni,
  onProveri,
  onUvezi,
  pocetniModal = null,
  pocetniTekst,
  pocetniProvera,
}: MenuAdminRezimProps) {
  return (
    <>
      <RezimKartica
        usluga={usluga}
        lokal={lokal}
        onPromeni={onPromeni}
        pocetniModal={pocetniModal}
      />
      <UvozKartica
        onProveri={onProveri}
        onUvezi={onUvezi}
        pocetniModal={pocetniModal}
        pocetniTekst={pocetniTekst}
        pocetniProvera={pocetniProvera}
      />
    </>
  );
}
