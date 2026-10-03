import type { ReactNode } from "react";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import styles from "./memories.module.css";

// TASK-17 — the shared chrome of every guest screen: the always-dark shell,
// the host-brand masthead, the state hero, and the quiet product footer.
// Server-safe (no state, no effects) so pages can render a complete first
// paint before any client JS runs — the page never shows a blank shell.

export function MemoriesShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.root}>
      {/* This surface is a dark room's screen by design — the app-wide theme
          toggle does not apply here (same mechanism as the public Links page). */}
      <style>{`[data-theme-toggle="global"]{display:none!important}`}</style>
      <div className={styles.column}>{children}</div>
    </main>
  );
}

export function MemoriesMasthead({
  spaceName,
  businessName,
  logoUrl,
}: {
  spaceName: string;
  businessName: string;
  logoUrl: string | null;
}) {
  return (
    <header className={styles.masthead}>
      {logoUrl ? (
        // Host logos are small and served from signed storage URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.mastheadLogo} src={logoUrl} alt="" />
      ) : null}
      <div>
        <h1 className={styles.mastheadName}>{spaceName}</h1>
        {businessName !== spaceName ? (
          <p className={styles.mastheadBusiness}>{businessName}</p>
        ) : null}
      </div>
    </header>
  );
}

export function MemoriesStateHero({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className={styles.stateHero}>
      <h2 className={styles.stateTitle}>{title}</h2>
      <p className={styles.stateBody}>{body}</p>
    </section>
  );
}

export function MemoriesFooterBrand() {
  return <p className={styles.footerBrand}>{dict.footerBrand}</p>;
}
