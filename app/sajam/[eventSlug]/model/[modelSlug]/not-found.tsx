import Link from "next/link";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";

export default function FairModelNotFound() {
  return (
    <main className="fair-event fair-not-found" data-reveal="off">
      <div>
        <h1>{fairModelSr.notFoundTitle}</h1>
        <p>{fairModelSr.notFoundBody}</p>
        <Link href="/">{fairModelSr.backToScanMe}</Link>
      </div>
    </main>
  );
}
