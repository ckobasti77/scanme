"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { Eye, EyeOff, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWordmark } from "@/components/client-panel/client-wordmark";
import { api } from "@/convex/_generated/api";

const shortDate = new Intl.DateTimeFormat("sr-Latn-RS", { day: "2-digit", month: "2-digit" });
const numberFormatter = new Intl.NumberFormat("sr-Latn-RS");

export function ClientPanel({ slug }: { slug: string }) {
  const location = useQuery(api.clientPanel.publicLocation, { slug });
  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ClientWordmark />
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
  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Google Review kartice</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{metrics.businessName}</h1></div>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="size-4" /> Odjava</Button>
      </div>
      <dl className="mt-7 grid grid-cols-2 border border-border bg-card lg:grid-cols-[1.55fr_1fr_1fr]">
        <div className="relative col-span-2 min-h-36 overflow-hidden border-b border-border p-5 sm:min-h-52 sm:p-7 lg:col-span-1 lg:border-b-0">
          <dt className="text-xs text-muted-foreground">Ukupno skeniranja</dt>
          <AnimatedTotal value={metrics.total} />
        </div>
        <div className="border-r border-border p-5 sm:p-7 lg:border-l">
          <dt className="text-xs text-muted-foreground">Danas</dt>
          <dd className="mt-5 text-3xl font-semibold tabular-nums text-primary sm:text-4xl">{numberFormatter.format(metrics.today)}</dd>
        </div>
        <div className="p-5 sm:p-7">
          <dt className="text-xs text-muted-foreground">Poslednjih 7 dana</dt>
          <dd className="mt-5 text-3xl font-semibold tabular-nums text-primary sm:text-4xl">{numberFormatter.format(metrics.last7Days)}</dd>
        </div>
      </dl>
      <section className="mt-5 border border-border bg-card p-5 sm:mt-7 sm:p-7">
        <h2 className="font-semibold">Skeniranja po danu</h2>
        <div className="mt-6 grid h-44 grid-cols-7 items-end gap-2 sm:h-64 sm:gap-4" role="img" aria-label={`Skeniranja tokom poslednjih sedam dana: ${metrics.daily.map((row) => `${shortDate.format(new Date(`${row.dateKey}T12:00:00`))}, ${row.count}`).join("; ")}`}>
          {metrics.daily.map((row) => (
            <div key={row.dateKey} className="grid h-full min-w-0 grid-rows-[1fr_auto_auto] gap-2">
              <div className="flex items-end border-b border-border">
                <div className="w-full bg-primary" style={{ height: `${Math.max(3, row.count / maximum * 100)}%` }} />
              </div>
              <strong className="text-center text-xs tabular-nums">{numberFormatter.format(row.count)}</strong>
              <span className="truncate text-center text-[10px] text-muted-foreground sm:text-xs">{shortDate.format(new Date(`${row.dateKey}T12:00:00`))}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function AnimatedTotal({ value }: { value: number }) {
  const reducedMotion = useReducedMotion();
  const count = useMotionValue(value);
  const displayedCount = useTransform(count, (latest) => numberFormatter.format(Math.round(latest)));

  useEffect(() => {
    if (reducedMotion) {
      count.set(value);
      return;
    }
    const controls = animate(count, value, { duration: 0.4, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [count, reducedMotion, value]);

  return (
    <dd className="mt-5" aria-live="polite" aria-atomic="true">
      <span className="sr-only">{numberFormatter.format(value)} ukupno skeniranja</span>
      <motion.span aria-hidden="true" className="block text-6xl font-semibold leading-none tabular-nums tracking-[-0.07em] text-primary sm:text-7xl">
        {displayedCount}
      </motion.span>
      <motion.span
        key={value}
        aria-hidden="true"
        className="absolute inset-x-5 bottom-0 h-px origin-left bg-primary sm:inset-x-7"
        initial={reducedMotion ? false : { opacity: 0.25, scaleX: 0.2 }}
        animate={reducedMotion ? { opacity: 0.45, scaleX: 1 } : { opacity: [0.25, 1, 0.45], scaleX: 1 }}
        transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
    </dd>
  );
}

function PanelLoading() {
  return (
    <div className="grid gap-5" aria-label="Učitavanje metrike">
      <div className="h-2 w-44 animate-pulse bg-primary" />
      <div className="grid grid-cols-2 border border-border bg-card lg:grid-cols-[1.55fr_1fr_1fr]">
        <div className="col-span-2 h-36 animate-pulse border-b border-border sm:h-52 lg:col-span-1 lg:border-b-0" />
        <div className="h-28 animate-pulse border-r border-border lg:h-auto lg:border-l" />
        <div className="h-28 animate-pulse lg:h-auto" />
      </div>
      <div className="h-72 animate-pulse border border-border bg-card" />
    </div>
  );
}
