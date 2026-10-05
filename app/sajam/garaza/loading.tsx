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
              <small>{dict.garageNav}</small>
            </span>
          </div>
        </div>
      </header>
      <main style={{ width: "min(100%, 1040px)", marginInline: "auto", padding: "32px 20px" }}>
        <h1 style={{ margin: 0, fontSize: "clamp(30px, 5vw, 52px)", letterSpacing: "-0.055em" }}>
          {dict.pageTitle}
        </h1>
        <p style={{ color: "var(--fair-ink-muted)" }}>{dict.pageBody}</p>
      </main>
    </div>
  );
}
