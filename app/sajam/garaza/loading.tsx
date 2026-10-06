import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";

export default function FairGarageLoading() {
  return (
    <div className="fair-event" data-reveal="off">
      <header className="fair-shell">
        <div className="fair-shell__inner">
          <div className="fair-event-lockup">
            <span className="fair-event-lockup__mark" aria-hidden="true" />
            <span>
              <strong>{dict.umbrellaTitle}</strong>
              <small>{dict.pageTitle}</small>
            </span>
          </div>
        </div>
      </header>
      <main style={{ width: "min(100%, 1080px)", marginInline: "auto", padding: "14px 18px" }}>
        <div style={{ height: 52, border: "1px solid var(--fair-line)", borderRadius: 17, background: "var(--fair-surface)" }} />
        <div style={{ height: 48, width: "min(100%, 430px)", marginTop: 12, borderRadius: 15, background: "color-mix(in srgb, var(--fair-warm) 48%, white)" }} />
      </main>
    </div>
  );
}
