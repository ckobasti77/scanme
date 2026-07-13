import { Construction } from "lucide-react";
import { AdminGuard } from "./admin-guard";
import { AdminShell } from "./admin-shell";

export function AdminPlaceholder({ title }: { title: string }) {
  return (
    <AdminGuard>
      <AdminShell>
        <section className="border border-border bg-card p-6 sm:p-10">
          <Construction className="size-7 text-primary" aria-hidden="true" />
          <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">{title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Modul je pripremljen u navigaciji, ali funkcionalnost još nije uključena. Trenutni MVP radi samo sa Google Review karticama.</p>
        </section>
      </AdminShell>
    </AdminGuard>
  );
}
