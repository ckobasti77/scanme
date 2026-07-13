"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { Eye, EyeOff, LoaderCircle, LogOut, ScanLine, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";

const dateFormatter = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit" });

export function ClientPanel({ slug }: { slug: string }) {
  const location = useQuery(api.clientPanel.publicLocation, { slug });
  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-h-11 items-center gap-3 font-semibold"><span className="scan-mark" aria-hidden="true" /> SCANME</div>
          <span className="text-xs text-muted-foreground">Klijentski panel</span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <AuthLoading><PanelLoading /></AuthLoading>
        <Unauthenticated><ClientLogin slug={slug} businessName={location?.name ?? null} /></Unauthenticated>
        <Authenticated><MetricsPanel slug={slug} /></Authenticated>
      </div>
    </main>
  );
}

function ClientLogin({ businessName }: { slug: string; businessName: string | null }) {
  const { signIn } = useAuthActions();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    data.set("flow", "signIn");
    try { await signIn("password", data); }
    catch { setError("Email ili šifra nisu ispravni, ili nalog više nema pristup lokalu."); }
    finally { setPending(false); }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_440px] lg:items-center">
      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{businessName ?? "Zaštićena metrika lokala"}</p>
        <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.06em] sm:text-5xl">Skenovi vašeg lokala, bez pristupa admin sistemu.</h1>
        <div className="mt-8 flex max-w-xl items-start gap-3 border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><p>Ova adresa prikazuje samo metriku lokala koji je vezan za QR slug u URL-u.</p></div>
      </section>
      <form onSubmit={submit} className="border border-border bg-card p-6 sm:p-8">
        <h2 className="text-2xl font-semibold tracking-[-0.04em]">Prijava</h2>
        <p className="mt-2 text-sm text-muted-foreground">Koristite email iz ScanMe pozivnice i šifru koju ste postavili.</p>
        <div className="mt-7 grid gap-5">
          <div className="form-field"><Label htmlFor="client-email">Email *</Label><Input id="client-email" name="email" type="email" autoComplete="email" required className="form-control h-12" /></div>
          <div className="form-field"><Label htmlFor="client-password">Šifra *</Label><div className="relative"><Input id="client-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="form-control h-12 pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-12 place-items-center text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Sakrij šifru" : "Prikaži šifru"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div></div>
          {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending} className="h-12">{pending ? <LoaderCircle className="size-4 animate-spin" /> : null} Prijavi se</Button>
        </div>
      </form>
    </div>
  );
}

function MetricsPanel({ slug }: { slug: string }) {
  const metrics = useQuery(api.clientPanel.metrics, { slug });
  const { signOut } = useAuthActions();
  if (metrics === undefined) return <PanelLoading />;
  if (metrics.status === "forbidden") {
    return <section className="border border-border bg-card p-6 sm:p-10"><ShieldCheck className="size-8 text-destructive" /><h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em]">Nemate pristup ovom lokalu.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Prijavljeni nalog nije povezan sa lokalom iz ove adrese. Promena sluga ne otkriva podatke drugih lokala.</p><Button variant="outline" className="mt-7" onClick={() => void signOut()}><LogOut className="size-4" /> Odjavi se</Button></section>;
  }
  const maximum = Math.max(1, ...metrics.daily.map((row) => row.count));
  const deviceRows = [
    ["Mobilni", metrics.deviceCounts.mobile],
    ["Tablet", metrics.deviceCounts.tablet],
    ["Desktop", metrics.deviceCounts.desktop],
    ["Nepoznato", metrics.deviceCounts.unknown],
  ];
  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Google Review kartice</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{metrics.businessName}</h1></div>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="size-4" /> Odjava</Button>
      </div>
      <dl className="mt-7 grid border border-border bg-card sm:grid-cols-3">
        {[["Ukupno skeniranja", metrics.total], ["Danas", metrics.today], ["Poslednjih 7 dana", metrics.last7Days]].map(([label, value], index) => <div key={String(label)} className={`p-5 sm:p-7 ${index ? "border-t border-border sm:border-l sm:border-t-0" : ""}`}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-4 text-4xl font-semibold tabular-nums text-primary">{value}</dd></div>)}
      </dl>
      <div className="mt-7 grid gap-7 lg:grid-cols-[1.3fr_.7fr]">
        <section className="border border-border bg-card p-5 sm:p-7"><h2 className="font-semibold">Skeniranja po danu</h2><div className="mt-7 grid h-52 grid-cols-7 items-end gap-2" role="img" aria-label="Broj skeniranja tokom poslednjih sedam dana">{metrics.daily.map((row) => <div key={row.dateKey} className="grid h-full grid-rows-[1fr_auto_auto] gap-2"><div className="flex items-end"><div className="w-full bg-primary" style={{ height: `${Math.max(3, row.count / maximum * 100)}%` }} /></div><strong className="text-center text-xs tabular-nums">{row.count}</strong><span className="text-center text-[10px] text-muted-foreground">{shortDate.format(new Date(`${row.dateKey}T12:00:00`))}</span></div>)}</div></section>
        <section className="border border-border bg-card p-5 sm:p-7"><h2 className="font-semibold">Uređaji</h2><p className="mt-2 text-xs text-muted-foreground">Uzorak poslednjih {metrics.sampleSize} skeniranja</p><dl className="mt-5 grid gap-3">{deviceRows.map(([label, value]) => <div key={String(label)} className="flex items-center justify-between border-b border-border pb-3 text-sm"><dt>{label}</dt><dd className="tabular-nums text-primary">{value}</dd></div>)}</dl>{metrics.topReferrers.length ? <><h3 className="mt-7 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Najčešći izvori</h3><ol className="mt-3 grid gap-2 text-xs">{metrics.topReferrers.map((row) => <li key={row.host} className="flex justify-between gap-3"><span className="truncate">{row.host}</span><span className="tabular-nums">{row.count}</span></li>)}</ol></> : null}</section>
      </div>
      <section className="mt-7 border border-border bg-card p-5 sm:p-7"><div className="flex items-center gap-3"><ScanLine className="size-5 text-primary" /><h2 className="font-semibold">Nedavna skeniranja</h2></div>{metrics.recent.length ? <ol className="mt-5 grid gap-2">{metrics.recent.map((scan) => <li key={scan.id} className="grid gap-1 border border-border px-3 py-3 text-xs sm:grid-cols-[1fr_auto] sm:items-center"><span>{scan.deviceCategory}{scan.referrerHost ? ` · ${scan.referrerHost}` : ""}</span><time className="text-muted-foreground">{dateFormatter.format(new Date(scan.scannedAt))}</time></li>)}</ol> : <p className="mt-5 text-sm text-muted-foreground">Još nema skeniranja. Prvi uspešan QR zahtev pojaviće se ovde.</p>}</section>
    </div>
  );
}

function PanelLoading() { return <div className="grid gap-5"><div className="h-2 w-44 animate-pulse bg-primary" /><div className="h-36 animate-pulse border border-border bg-card" /><div className="h-72 animate-pulse border border-border bg-card" /></div>; }
