import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

export function ComingSoon() {
  return (
    <main className="flex min-h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b border-foreground/12">
        <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <span className="inline-flex items-center gap-3 font-semibold tracking-[-0.04em]">
            <span className="scan-mark" aria-hidden="true" />
            ScanMe
          </span>
          <Link href="/preview-login" className="button-secondary focus-signal h-11 min-h-11 px-4">
            Admin login
            <ArrowUpRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1440px] flex-1 items-center gap-14 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-10 lg:py-24">
        <div>
          <p className="accent-label text-sm font-medium">Uskoro</p>
          <h1 className="mt-6 max-w-[12ch] text-5xl font-semibold leading-[0.94] tracking-[-0.065em] sm:text-6xl lg:text-7xl">
            Jedan sken. Prava akcija. Uskoro.
          </h1>
          <p className="mt-7 max-w-[48ch] text-base leading-7 text-foreground/64 sm:text-lg">
            Pripremamo ScanMe platformu za lokalne biznise. Vraćamo se uskoro.
          </p>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[620px]" aria-hidden="true">
          <div className="scan-frame inset-0 w-full">
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="absolute inset-[14%] border border-foreground/12" />
          <div className="absolute inset-[31%] grid place-items-center border border-primary bg-card">
            <span className="scan-mark scale-[3]" />
          </div>
        </div>
      </section>
    </main>
  );
}
