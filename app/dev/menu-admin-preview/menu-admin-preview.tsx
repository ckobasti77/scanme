"use client";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  MenuAdminRezim,
  type RezimIshod,
  type RezimUsluga,
  type UvozIshod,
} from "@/components/admin/menu-admin-rezim";
import { MenuAdminSubpage } from "@/components/admin/menu-admin-subpage";
import type { Id } from "@/convex/_generated/dataModel";
import { menuAdminSr as dict } from "@/lib/i18n/sr/menu-admin";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { MENU_ERROR } from "@/lib/menu/errors/core";
import { featuresDroppedByModeChange, isModeAvailable, type MenuMode } from "@/lib/menu/modes";

// K28 fixture: an invented venue, local fake handlers, no Convex.
const FIXTURE_LOKAL = "Demo restoran";
const FIXTURE_USLUGA: RezimUsluga = {
  mode: "hospitality",
  modeSetAt: Date.UTC(2026, 9, 12, 8, 30),
  features: {
    callWaiter: true,
    billRequest: true,
    ordering: false,
    roomService: false,
    occupancy: true,
    reservations: "form",
  },
};
const FIXTURE_JSON = JSON.stringify(
  { groups: [{ title: "Predjela", items: [{ name: "Proja", price: 350 }] }] },
  null,
  2,
);
const FIXTURE_PROVERA = {
  ok: true as const,
  imported: false,
  grupe: 3,
  artikli: 24,
  upozorenja: 1,
  duplikati: 0,
  blokade: [] as string[],
} satisfies UvozIshod;

/** Mirrors menuServices.adminSetMode: a mode that is not available in V1 is refused. */
async function lazniPromeni(mode: MenuMode): Promise<RezimIshod> {
  if (!isModeAvailable(mode)) {
    return { ok: false, poruka: `${dict.rezimGreska} ${menuDomenSr.errors[MENU_ERROR.modeNotAvailable]}` };
  }
  return {
    ok: true,
    changed: mode !== FIXTURE_USLUGA.mode,
    droppedFeatures: featuresDroppedByModeChange(FIXTURE_USLUGA.mode, mode),
  };
}

async function parseOrFail(json: string): Promise<UvozIshod | null> {
  try {
    JSON.parse(json);
    return null;
  } catch {
    return { ok: false, poruka: dict.uvozNeispravan };
  }
}

async function lazniProveri(json: string): Promise<UvozIshod> {
  return (await parseOrFail(json)) ?? FIXTURE_PROVERA;
}

async function lazniUvezi(json: string): Promise<UvozIshod> {
  return (
    (await parseOrFail(json)) ?? { ...FIXTURE_PROVERA, imported: true, uvezeno: 24 }
  );
}

function MenuAdminFixture({ modal }: { modal: "rezim" | "uvoz" | null }) {
  return (
    <main className="offer-surface mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="offer-frame overflow-hidden">
        <div className="offer-glass offer-glass--panel p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {dict.eyebrow}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.03em]">
            {FIXTURE_LOKAL}
          </h1>
          <MenuAdminRezim
            usluga={FIXTURE_USLUGA}
            lokal={FIXTURE_LOKAL}
            onPromeni={lazniPromeni}
            onProveri={lazniProveri}
            onUvezi={lazniUvezi}
            pocetniModal={modal}
            pocetniTekst={modal === "uvoz" ? FIXTURE_JSON : undefined}
            pocetniProvera={modal === "uvoz" ? FIXTURE_PROVERA : null}
          />
        </div>
      </div>
    </main>
  );
}

export function MenuAdminPreview({
  businessId,
  fixture = false,
  modal = null,
}: {
  businessId: string | null;
  fixture?: boolean;
  modal?: "rezim" | "uvoz" | null;
}) {
  if (fixture) return <MenuAdminFixture modal={modal} />;
  return (
    <AdminGuard>
      <AdminShell>
        <div className="offer-surface">
          {businessId ? (
            <MenuAdminSubpage businessId={businessId as Id<"businesses">} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {dict.loadError} (?businessId=…)
            </p>
          )}
        </div>
      </AdminShell>
    </AdminGuard>
  );
}
