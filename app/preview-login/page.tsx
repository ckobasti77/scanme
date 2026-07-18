import type { Metadata } from "next";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { hasPreviewAccess } from "@/lib/preview-access";
import { unlockPreview } from "./actions";

export const metadata: Metadata = {
  title: "Admin preview | ScanMe",
  robots: { index: false, follow: false },
};

export default async function PreviewLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await hasPreviewAccess()) redirect("/");
  const { error } = await searchParams;

  return (
    <main className="relative grid min-h-[100dvh] place-items-center bg-background px-4 py-20 text-foreground sm:px-6">
      <ThemeToggle className="absolute right-4 top-4" />
      <section className="w-full max-w-lg border border-foreground/16 bg-card p-6 sm:p-10">
        <Link href="/" className="focus-signal inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
          Nazad
        </Link>

        <LockKeyhole aria-hidden="true" className="mt-10 size-8 text-primary" strokeWidth={1.5} />
        <h1 className="mt-7 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Admin preview</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
          Unesite privatni ključ da otvorite trenutnu verziju ScanMe landing stranice.
        </p>

        <form action={unlockPreview} className="mt-8 grid gap-5">
          <div className="form-field">
            <label htmlFor="preview-passkey" className="text-sm font-medium">Preview ključ</label>
            <input
              id="preview-passkey"
              name="passkey"
              type="password"
              autoComplete="current-password"
              minLength={32}
              maxLength={32}
              required
              spellCheck={false}
              aria-describedby={error === "invalid" ? "preview-error" : "preview-help"}
              aria-invalid={error === "invalid"}
              className="form-control h-12 px-3"
            />
            <p id="preview-help" className="text-xs leading-5 text-muted-foreground">Ključ ima tačno 32 karaktera.</p>
            {error === "invalid" ? (
              <p id="preview-error" role="alert" className="text-sm leading-6 text-destructive">
                Ključ nije ispravan. Proverite unos i pokušajte ponovo.
              </p>
            ) : null}
          </div>
          <button type="submit" className="button-primary focus-signal h-12">Otvori landing</button>
        </form>
      </section>
    </main>
  );
}
