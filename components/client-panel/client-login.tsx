"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClientLoginForm({
  compact = false,
  onSuccess,
}: {
  compact?: boolean;
  onSuccess?: () => void;
}) {
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

    try {
      await signIn("password", data);
      onSuccess?.();
    } catch {
      setError("Email ili šifra nisu ispravni, ili nalog više nema pristup lokalu.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={compact ? "grid gap-5" : "border border-border bg-card p-6 sm:p-8"}>
      {!compact ? (
        <>
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">Prijava</h2>
          <p className="mt-2 text-sm text-muted-foreground">Koristite email iz ScanMe pozivnice i šifru koju ste postavili.</p>
        </>
      ) : null}
      <div className={compact ? "grid gap-5" : "mt-7 grid gap-5"}>
        <div className="form-field">
          <Label htmlFor="client-email">Email *</Label>
          <Input id="client-email" name="email" type="email" autoComplete="email" required className="form-control h-12" />
        </div>
        <div className="form-field">
          <Label htmlFor="client-password">Šifra *</Label>
          <div className="relative">
            <Input id="client-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="form-control h-12 pr-12" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-0 top-0 grid size-12 place-items-center text-muted-foreground hover:text-foreground" aria-label={showPassword ? "Sakrij šifru" : "Prikaži šifru"}>
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        {error ? <p role="alert" className="text-sm leading-6 text-destructive">{error}</p> : null}
        <Button type="submit" disabled={pending} className="h-12">
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
          Prijavi se
        </Button>
      </div>
    </form>
  );
}
