"use client";

import { ConvexError } from "convex/values";
import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { ArrowUpRight, Eye, EyeOff, LoaderCircle, LogOut, PencilLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientWordmark } from "@/components/client-panel/client-wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { MetricsBarChart } from "@/components/metrics-bar-chart";
import { MetricsPeriodSelect } from "@/components/metrics-period-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MetricsRange } from "@/convex/lib/metrics";
import { useRetainedQueryResult } from "@/lib/use-retained-query-result";

const numberFormatter = new Intl.NumberFormat("sr-Latn-RS");

export function ClientPanel({ slug }: { slug: string }) {
  const location = useQuery(api.clientPanel.publicLocation, { slug });
  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <ClientWordmark />
          <ThemeToggle />
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <AuthLoading><PanelLoading /></AuthLoading>
        <Unauthenticated><ClientLogin slug={slug} businessName={location?.name ?? null} /></Unauthenticated>
        <Authenticated><ServicesPanel slug={slug} /></Authenticated>
      </div>
    </main>
  );
}

type ServiceTab = "scanme_links" | "google_review";

function ServicesPanel({ slug }: { slug: string }) {
  const overview = useQuery(api.clientPanel.overview, { slug });
  const [selectedTab, setSelectedTab] = useState<ServiceTab | null>(null);

  if (overview === undefined) return <PanelLoading />;
  if (overview.status === "forbidden") {
    return (
      <section className="border border-border bg-card p-6 sm:p-10">
        <ShieldCheck className="size-8 text-destructive" />
        <h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em]">
          Nemate pristup ovom lokalu.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">
          Prijavljeni nalog nije povezan sa lokalom iz ove adrese.
        </p>
      </section>
    );
  }
  const defaultTab: ServiceTab = overview.services.scanMeLinks.active
    ? "scanme_links"
    : overview.services.googleReview.active
      ? "google_review"
      : "scanme_links";
  const tab = selectedTab ?? defaultTab;

  return (
    <Tabs value={tab} onValueChange={(value) => setSelectedTab(value as ServiceTab)}>
      <div className="mb-7 flex justify-end border-b border-border pb-5">
        <TabsList className="h-auto min-h-11 w-full sm:w-auto">
          <TabsTrigger value="scanme_links" className="min-h-9 px-4">
            ScanMe Links
          </TabsTrigger>
          <TabsTrigger value="google_review" className="min-h-9 px-4">
            Google Review
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="scanme_links">
        {overview.services.scanMeLinks.active ||
        overview.services.scanMeLinks.clientEditingEnabled ? (
          <ScanMeLinksMetricsPanel
            slug={slug}
            canEdit={overview.services.scanMeLinks.clientEditingEnabled}
            serviceActive={overview.services.scanMeLinks.active}
          />
        ) : (
          <LockedService
            businessId={overview.businessId}
            service="scanme_links"
            hasOpenRequest={overview.services.scanMeLinks.hasOpenRequest}
          />
        )}
      </TabsContent>
      <TabsContent value="google_review">
        {overview.services.googleReview.active ? (
          <MetricsPanel slug={slug} />
        ) : (
          <LockedService
            businessId={overview.businessId}
            service="google_review"
            hasOpenRequest={overview.services.googleReview.hasOpenRequest}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function LockedService({
  businessId,
  service,
  hasOpenRequest,
}: {
  businessId: Id<"businesses">;
  service: ServiceTab;
  hasOpenRequest: boolean;
}) {
  const createRequest = useMutation(api.activationRequests.create);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(hasOpenRequest);
  const [error, setError] = useState<string | null>(null);
  const label = service === "scanme_links" ? "ScanMe Links" : "Google Review";

  async function submitRequest() {
    setPending(true);
    setError(null);
    try {
      await createRequest({ businessId, requestedService: service });
      setSent(true);
    } catch (reason) {
      setError(
        reason instanceof ConvexError && typeof reason.data === "string"
          ? reason.data
          : reason instanceof Error
            ? reason.message
            : "Upit trenutno nije moguće poslati. Pokušajte ponovo.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="border border-border bg-card p-6 sm:p-10">
      <p className="text-sm font-semibold text-destructive">Usluga nije aktivna</p>
      <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
        Trenutno niste pretplaćeni na ovu uslugu.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
        {label} može biti dodat postojećem ScanMe nalogu bez otvaranja novog
        klijentskog panela.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button onClick={submitRequest} disabled={pending || sent}>
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {sent ? "Upit je poslat" : "Pošalji upit za aktivaciju"}
        </Button>
        <Button asChild variant="outline">
          <Link href="/#scanme-links">
            Saznaj više <ArrowUpRight className="size-4" />
          </Link>
        </Button>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ScanMeLinksMetricsPanel({
  slug,
  canEdit,
  serviceActive,
}: {
  slug: string;
  canEdit: boolean;
  serviceActive: boolean;
}) {
  const [range, setRange] = useState<MetricsRange>("7d");
  const [destinationId, setDestinationId] =
    useState<Id<"serviceDestinations"> | null>(null);
  const metricsQuery = useQuery(api.clientPanel.scanMeLinksMetrics, {
    slug,
    range,
    ...(destinationId ? { destinationId } : {}),
  });
  const metrics = useRetainedQueryResult(metricsQuery, `${slug}-scanme-links`);
  const { signOut } = useAuthActions();
  if (metrics === undefined) return <PanelLoading />;
  if (metrics.status !== "available") return null;

  return (
    <div aria-busy={metricsQuery === undefined}>
      {!serviceActive && canEdit ? (
        <div
          className="mb-6 border-l-2 border-primary bg-primary/5 px-4 py-3 text-sm leading-6 text-muted-foreground"
          role="status"
        >
          Stranica još nije aktivna. Možete pripremiti i objaviti sadržaj u
          editoru; administrator uključuje javni servis.
        </div>
      ) : null}
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            ScanMe Links
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">
            {metrics.businessName}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Button asChild>
              <Link href={`/${encodeURIComponent(slug)}/editor`}>
                <PencilLine className="size-4" />
                Uredi stranicu
              </Link>
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Odjava
          </Button>
        </div>
      </div>
      <dl className="mt-7 grid grid-cols-1 border border-border bg-card sm:grid-cols-3">
        <div className="flex min-h-40 flex-col items-center justify-center border-b border-border p-5 text-center sm:border-b-0 sm:border-r">
          <dt className="text-xs text-muted-foreground">Ukupno skeniranja</dt>
          <dd className="mt-5 text-5xl font-semibold tabular-nums text-primary">
            {numberFormatter.format(metrics.totalScans)}
          </dd>
        </div>
        <div className="flex min-h-40 flex-col items-center justify-center border-b border-border p-5 text-center sm:border-b-0 sm:border-r">
          <dt className="text-xs text-muted-foreground">Prikazi stranice</dt>
          <dd className="mt-5 text-4xl font-semibold tabular-nums text-primary">
            {numberFormatter.format(metrics.totalPageViews)}
          </dd>
        </div>
        <div className="flex min-h-40 flex-col items-center justify-center p-5 text-center">
          <dt className="text-xs text-muted-foreground">CTR</dt>
          <dd className="mt-5 text-4xl font-semibold tabular-nums text-primary">
            {metrics.totalPageViews
              ? new Intl.NumberFormat("sr-Latn-RS", {
                  style: "percent",
                  maximumFractionDigits: 1,
                }).format(metrics.ctr)
              : "—"}
          </dd>
        </div>
      </dl>

      <section className="mt-5 border border-border bg-card p-5 sm:mt-7 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-semibold">
              {destinationId ? "Aktivnost izabrane destinacije" : "Skeniranja po periodu"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Izaberite destinaciju za njen broj klikova ili direktnih odlazaka.
            </p>
          </div>
          <Select value={range} onValueChange={(value) => setRange(value as MetricsRange)}>
            <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Period metrike">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 dana</SelectItem>
              <SelectItem value="30d">30 dana</SelectItem>
              <SelectItem value="90d">3 meseca</SelectItem>
              <SelectItem value="1y">1 godina</SelectItem>
              <SelectItem value="all">Oduvek</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-2">
          <Button
            type="button"
            variant={destinationId ? "outline" : "default"}
            onClick={() => setDestinationId(null)}
          >
            Svi skenovi
          </Button>
          {metrics.destinations.map((destination) => (
            <Button
              key={destination.id}
              type="button"
              variant={destinationId === destination.id ? "default" : "outline"}
              className={destination.state !== "active" ? "opacity-60" : ""}
              onClick={() => setDestinationId(destination.id)}
            >
              {destination.label}
              {destination.state === "deleted" ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-destructive">
                  Obrisano
                </span>
              ) : null}
              <span className="tabular-nums">
                {numberFormatter.format(
                  destination.totalClicks || destination.totalDirectVisits,
                )}
              </span>
            </Button>
          ))}
        </div>

        <MetricsBarChart
          rows={metrics.daily}
          rangeLabel={metrics.rangeLabel}
          heightClassName="h-44 sm:h-64"
          showCounts
          barMinWidth={48}
          variant={metrics.range === "all" ? "line" : "bars"}
        />
      </section>
    </div>
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
  const [graphRange, setGraphRange] = useState<MetricsRange>("7d");
  const [summaryRange, setSummaryRange] = useState<MetricsRange>("7d");
  const metricsQuery = useQuery(api.clientPanel.metrics, { slug, range: graphRange, summaryRange });
  const metrics = useRetainedQueryResult(metricsQuery, slug);
  const { signOut } = useAuthActions();
  if (metrics === undefined) return <PanelLoading />;
  if (metrics.status === "forbidden") {
    return <section className="border border-border bg-card p-6 sm:p-10"><ShieldCheck className="size-8 text-destructive" /><h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em]">Nemate pristup ovom lokalu.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Prijavljeni nalog nije povezan sa lokalom iz ove adrese. Promena sluga ne otkriva podatke drugih lokala.</p><Button variant="outline" className="mt-7" onClick={() => void signOut()}><LogOut className="size-4" /> Odjavi se</Button></section>;
  }
  return (
    <div aria-busy={metricsQuery === undefined}>
      <div className="flex flex-col gap-5 border-b border-border pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Google Review kartice</p><h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">{metrics.businessName}</h1></div>
        <Button variant="outline" onClick={() => void signOut()}><LogOut className="size-4" /> Odjava</Button>
      </div>
      <dl className="mt-7 grid grid-cols-1 border border-border bg-card sm:grid-cols-2 lg:grid-cols-[1.55fr_1fr_1fr]">
        <div className="relative col-span-1 flex min-h-36 flex-col overflow-hidden border-b border-border p-5 text-center sm:col-span-2 sm:min-h-52 sm:p-7 lg:col-span-1 lg:border-b-0">
          <dt className="flex min-h-9 items-center justify-center text-xs text-muted-foreground">Ukupno skeniranja</dt>
          <AnimatedTotal value={metrics.total} />
        </div>
        <div className="flex min-h-36 flex-col border-b border-border p-5 text-center sm:min-h-52 sm:border-b-0 sm:border-r sm:p-7 lg:border-l">
          <dt className="flex min-h-9 items-center justify-center text-xs text-muted-foreground">Danas</dt>
          <dd className="flex flex-1 items-center justify-center text-3xl font-semibold tabular-nums text-primary sm:text-4xl">{numberFormatter.format(metrics.today)}</dd>
        </div>
        <div className="flex min-h-36 flex-col p-5 text-center sm:min-h-52 sm:p-7">
          <dt className="flex min-h-9 items-center justify-center"><MetricsPeriodSelect value={summaryRange} onChange={setSummaryRange} ariaLabel="Period prikazane metrike" triggerClassName="min-h-9" /></dt>
          <dd className="flex flex-1 items-center justify-center text-3xl font-semibold tabular-nums text-primary sm:text-4xl">{numberFormatter.format(metrics.summaryPeriodTotal)}</dd>
        </div>
      </dl>
      <section className="mt-5 border border-border bg-card p-5 sm:mt-7 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold">Skeniranja po periodu</h2>
          <Select value={graphRange} onValueChange={(value) => setGraphRange(value as MetricsRange)}>
            <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Period skenova"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 dana</SelectItem>
              <SelectItem value="30d">30 dana</SelectItem>
              <SelectItem value="90d">3 meseca</SelectItem>
              <SelectItem value="1y">1 godina</SelectItem>
              <SelectItem value="all">Oduvek</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <MetricsBarChart
          rows={metrics.daily}
          rangeLabel={metrics.rangeLabel}
          heightClassName="h-44 sm:h-64"
          showCounts
          barMinWidth={48}
          variant={metrics.range === "all" ? "line" : "bars"}
        />
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
    <dd className="flex flex-1 flex-col items-center justify-center text-center" aria-live="polite" aria-atomic="true">
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
      <div className="grid grid-cols-1 border border-border bg-card sm:grid-cols-2 lg:grid-cols-[1.55fr_1fr_1fr]">
        <div className="col-span-1 h-36 animate-pulse border-b border-border sm:col-span-2 sm:h-52 lg:col-span-1 lg:border-b-0" />
        <div className="h-36 animate-pulse border-b border-border sm:h-52 sm:border-b-0 sm:border-r lg:border-l" />
        <div className="h-36 animate-pulse sm:h-52" />
      </div>
      <div className="h-72 animate-pulse border border-border bg-card" />
    </div>
  );
}
