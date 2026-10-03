import { fairMapSr as dict } from "@/lib/i18n/sr/fair-map";

export default function FairEventNotFound() {
  return (
    <main className="fair-event fair-not-found" data-reveal="off">
      <div>
        <h1>{dict.notFoundTitle}</h1>
        <p>{dict.notFoundBody}</p>
      </div>
    </main>
  );
}
