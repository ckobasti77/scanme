"use client";

import { useRouter } from "next/navigation";
import { fairPassportSimCookie } from "@/lib/fair-passport-simulation";
import { showSimulationChange } from "../admin/fair-admin-simulation";
import { fairAdminDevSr as dict } from "@/lib/i18n/sr/fair-admin-dev";

// Shown above the passport pages while this browser runs the DEV passport
// simulation (rendered only in `next dev` when the simulation cookie is set).

export function PassportSimulationBar() {
  const router = useRouter();
  return (
    <div className="fair-admin-bar" role="note" style={{ height: 30, gap: 10 }}>
      <span>{dict.simBar}</span>
      <button
        type="button"
        onClick={() => {
          document.cookie = fairPassportSimCookie(null);
          showSimulationChange(router);
        }}
        style={{ height: 22, padding: "0 9px", border: "1px solid rgb(255 255 255 / .7)", borderRadius: 6, background: "rgb(0 0 0 / .18)", color: "#fff", font: "inherit", cursor: "pointer" }}
      >
        {dict.simOff}
      </button>
    </div>
  );
}
