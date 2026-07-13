"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Eye, EyeOff, LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminLogin() {
  const [mode, setMode] = useState<"signIn" | "setup">("signIn");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", mode === "setup" ? "signUp" : "signIn");
    try {
      await signIn("password", formData);
      router.replace("/admin/google-reviews");
    } catch {
      setError(mode === "setup" ? "Admin nalog nije aktiviran. Proverite email, setup secret i pravila za šifru." : "Email ili šifra nisu ispravni.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-background lg:grid-cols-[1fr_1.1fr]">
      <section className="hidden border-r border-border p-10 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 font-semibold"><span className="scan-mark" aria-hidden="true" /> SCANME ADMIN</div>
        <div>
          <div className="mb-8 h-px w-full bg-primary" />
          <p className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.06em]">Kontrola QR odredišta, lokala i metrike sa jednog mesta.</p>
        </div>
      </section>
      <section className="grid place-items-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-md border border-border bg-card p-6 sm:p-9">
          <div className="mb-10 flex items-center gap-3 font-semibold lg:hidden"><span className="scan-mark" aria-hidden="true" /> SCANME ADMIN</div>
          <h1 className="text-3xl font-semibold tracking-[-0.05em]">{mode === "setup" ? "Aktivacija administratora" : "Admin prijava"}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{mode === "setup" ? "Koristi dozvoljeni admin email i setup secret iz okruženja." : "Prijavite se administratorskim emailom i šifrom."}</p>

          {isAuthenticated && !isLoading ? (
            <div className="mt-8 border border-border bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Jedan nalog je već prijavljen u ovom browseru.</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={() => router.replace("/admin/google-reviews")}>Nastavi</Button>
                <Button variant="outline" onClick={() => void signOut()}><LogOut className="size-4" /> Odjavi nalog</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 grid gap-5">
              <div className="form-field">
                <Label htmlFor="admin-email">Email *</Label>
                <Input id="admin-email" name="email" type="email" autoComplete="email" required className="form-control h-12" />
              </div>
              <div className="form-field">
                <Label htmlFor="admin-password">Šifra *</Label>
                <div className="relative">
                  <Input id="admin-password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "setup" ? "new-password" : "current-password"} required minLength={10} className="form-control h-12 pr-12" />
                  <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-12 place-items-center text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Sakrij šifru" : "Prikaži šifru"}>
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {mode === "setup" ? (
                <div className="form-field">
                  <Label htmlFor="admin-secret">Admin setup secret *</Label>
                  <Input id="admin-secret" name="adminSetupSecret" type="password" autoComplete="off" required className="form-control h-12" />
                  <p className="text-xs leading-5 text-muted-foreground">Šifra mora imati najmanje 10 karaktera, veliko i malo slovo i broj.</p>
                </div>
              ) : null}
              {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
              <Button type="submit" disabled={pending} className="h-12">
                {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {mode === "setup" ? "Aktiviraj admin nalog" : "Prijavi se"}
              </Button>
            </form>
          )}
          {!isAuthenticated ? (
            <button type="button" onClick={() => { setMode((value) => value === "signIn" ? "setup" : "signIn"); setError(null); }} className="mt-6 min-h-11 text-left text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
              {mode === "signIn" ? "Prvo podešavanje administratora" : "Već imam admin nalog"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
