"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Check, Eye, EyeOff, LoaderCircle, LogOut, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";

export function ActivationPanel({ slug, token }: { slug: string; token: string }) {
  const invitation = useQuery(api.invitations.getStatus, { slug, token });
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
      <div className="w-full max-w-xl border border-border bg-card p-6 sm:p-10">
        <div className="mb-10 flex items-center gap-3 font-semibold"><span className="scan-mark" aria-hidden="true" /> SCANME</div>
        {invitation === undefined ? <div className="h-48 animate-pulse bg-secondary" /> : invitation.status === "valid" ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{invitation.businessName}</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Aktivirajte klijentski panel</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Zdravo {invitation.firstName}. Postavite šifru za {invitation.email} ili se prijavite ako već imate ScanMe nalog.</p>
            <AuthLoading><div className="mt-8 h-40 animate-pulse bg-secondary" /></AuthLoading>
            <Unauthenticated><ActivationForms slug={slug} token={token} email={invitation.email} /></Unauthenticated>
            <Authenticated><AuthenticatedInvitation slug={slug} token={token} invitationEmail={invitation.email} /></Authenticated>
          </>
        ) : <InvalidInvitation status={invitation.status} slug={slug} />}
      </div>
    </main>
  );
}

function AuthenticatedInvitation({ slug, token, invitationEmail }: { slug: string; token: string; invitationEmail: string }) {
  const viewer = useQuery(api.invitations.currentViewer);
  if (viewer === undefined || viewer === null) {
    return <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-primary" /> Proveravamo prijavljeni nalog...</div>;
  }
  if (viewer.email !== invitationEmail) {
    return <InvitationAccountMismatch currentEmail={viewer.email} invitationEmail={invitationEmail} />;
  }
  return <ClaimInvitation slug={slug} token={token} />;
}

function InvitationAccountMismatch({ currentEmail, invitationEmail }: { currentEmail: string; invitationEmail: string }) {
  const { signOut } = useAuthActions();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchAccount() {
    setPending(true);
    setError(null);
    try {
      await signOut();
    } catch {
      setError("Odjava nije uspela. Osvežite stranicu i pokušajte ponovo.");
      setPending(false);
    }
  }

  return (
    <section className="mt-8 border border-destructive/60 bg-destructive/5 p-5" aria-labelledby="account-mismatch-title">
      <ShieldAlert className="size-7 text-destructive" aria-hidden="true" />
      <h2 id="account-mismatch-title" className="mt-4 text-xl font-semibold tracking-[-0.03em]">Prijavljen je drugi nalog</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Trenutno ste prijavljeni kao <strong className="text-foreground">{currentEmail}</strong>, a ova pozivnica je namenjena za <strong className="text-foreground">{invitationEmail}</strong>.
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Odjavite trenutni nalog, zatim postavite šifru ili se prijavite emailom iz pozivnice.</p>
      {error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null}
      <Button type="button" variant="outline" className="mt-5" disabled={pending} onClick={() => void switchAccount()}>
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
        Odjavi trenutni nalog
      </Button>
    </section>
  );
}

function ActivationForms({ slug, token, email }: { slug: string; token: string; email: string }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuthActions();
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    if (mode === "new") {
      if (data.get("password") !== data.get("confirmPassword")) {
        setError("Unete šifre se ne podudaraju."); setPending(false); return;
      }
      data.set("flow", "signUp");
      data.set("invitationToken", token);
      data.set("scanSlug", slug);
    } else {
      data.set("flow", "signIn");
    }
    try {
      await signIn("password", data);
      if (mode === "new") router.replace(`/${slug}/client-panel`);
    } catch {
      setError(mode === "new" ? "Nalog nije aktiviran. Proverite šifru i da li je pozivnica još važeća." : "Email ili šifra nisu ispravni.");
    } finally { setPending(false); }
  }

  return <div className="mt-8"><div className="grid grid-cols-2 border border-border"><button type="button" onClick={() => setMode("new")} className={`min-h-11 px-3 text-sm ${mode === "new" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Prvi pristup</button><button type="button" onClick={() => setMode("existing")} className={`min-h-11 border-l border-border px-3 text-sm ${mode === "existing" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Već imam nalog</button></div><form onSubmit={submit} className="mt-6 grid gap-5"><div className="form-field"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" name="email" type="email" value={email} readOnly className="form-control h-12 opacity-80" /></div><div className="form-field"><Label htmlFor="invite-password">Šifra *</Label><div className="relative"><Input id="invite-password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "new" ? "new-password" : "current-password"} minLength={10} required className="form-control h-12 pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-12 place-items-center text-muted-foreground" aria-label={showPassword ? "Sakrij šifru" : "Prikaži šifru"}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>{mode === "new" ? <p className="text-xs leading-5 text-muted-foreground">Najmanje 10 karaktera, veliko i malo slovo i broj.</p> : null}</div>{mode === "new" ? <div className="form-field"><Label htmlFor="invite-confirm">Ponovite šifru *</Label><Input id="invite-confirm" name="confirmPassword" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} required className="form-control h-12" /></div> : null}{error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}<Button type="submit" className="h-12" disabled={pending}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : null}{mode === "new" ? "Postavi šifru" : "Prijavi se i prihvati poziv"}</Button></form></div>;
}

function ClaimInvitation({ slug, token }: { slug: string; token: string }) {
  const claim = useMutation(api.invitations.claim);
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void claim({ slug, token }).then(() => router.replace(`/${slug}/client-panel`)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Pozivnica nije prihvaćena."));
  }, [claim, router, slug, token]);
  return error ? <p role="alert" className="mt-8 text-sm leading-6 text-destructive">{error}</p> : <div className="mt-8 flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin text-primary" /> Povezujemo nalog sa lokalom...</div>;
}

function InvalidInvitation({ status, slug }: { status: string; slug: string }) {
  const messages: Record<string, string> = { expired: "Pozivnica je istekla.", revoked: "Pozivnica je opozvana.", accepted: "Pozivnica je već iskorišćena.", invalid: "Pozivnica nije ispravna." };
  return <div><Check className="size-8 text-primary" /><h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em]">{messages[status] ?? "Pozivnica nije dostupna."}</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">Ako već imate nalog, otvorite klijentski panel. Za novu pozivnicu kontaktirajte ScanMe administratora.</p><Button asChild className="mt-7"><Link href={`/${slug}/client-panel`}>Otvori klijentski panel</Link></Button></div>;
}
