"use client";

import { useEffect } from "react";
import { useAdminFrame } from "@/components/admin/frame/admin-frame-context";
import { routeHref } from "@/lib/admin-v2/frame/routes";
import { cn } from "@/lib/utils";
import { BossBar } from "./boss-bar";
import { CauseChain } from "./cause-chain";
import { CeremonyLayer } from "./ceremony-layer";
import { ComboMeter } from "./combo-meter";
import { useGame, useGameApi } from "./game-context";
import { useGameInternal } from "./game-provider";
import { OperatorRow } from "./operator-row";
import { TeamBoard } from "./team-board";
import { Vitrina } from "./vitrina";
import { XpChip, XpProfileRing } from "./xp-chip";

// ADMIN v3 V4 — the parts of the game as the frame and the pages mount them:
// each reads the game of the frame (`useGame`) and hands it to a display
// component that only draws. Outside a frame they draw an empty game (nothing).

/** The XP chip of the navbar, left of the profile (from 1400 px): the ring of the level and „Nv 7“; a click opens the Vitrina. */
export function GameChip({ className }: { className?: string }) {
  const { view } = useGame();
  const api = useGameApi();
  return <XpChip operator={view.operator} onOpen={api.openVitrina} className={className} />;
}

/** The ring of the level around the profile icon, where the navbar has no room for the chip. */
export function GameProfileRing({ className }: { className?: string }) {
  const { view } = useGame();
  return <XpProfileRing operator={view.operator} className={className} />;
}

/** The row „Operater“ at the bottom of the sidebar and in the phone drawer: rank, level, the bar to the next level, the streak. */
export function GameOperator({ className }: { className?: string }) {
  const { view } = useGame();
  const api = useGameApi();
  return <OperatorRow operator={view.operator} streak={view.streak} onOpen={api.openVitrina} className={className} />;
}

/** The boss of the day and the combo, in the legend of the Dashboard hero. */
export function GameBoss({ className }: { className?: string }) {
  const { view, bossEvent, now } = useGame();
  return (
    <div className={cn("grid min-w-0 gap-2", className)}>
      <BossBar boss={view.boss} event={bossEvent} />
      <ComboMeter combo={view.combo} now={now} />
    </div>
  );
}

/** The weekly table of the team; its journals are read only while one of these is on the screen. */
export function GameTeam({ variant, href, className }: { variant: "full" | "strip"; href?: string; className?: string }) {
  const { view } = useGame();
  const { watchTeam } = useGameApi();
  const frame = useAdminFrame();
  useEffect(() => watchTeam(), [watchTeam]);
  return <TeamBoard board={view.team} variant={variant} href={href ? routeHref(href, frame?.route ?? null) : undefined} className={className} />;
}

/** What the game draws over the frame: the Vitrina, the ceremonies and the spark of gained XP. */
export function GameLayers() {
  const { view } = useGame();
  const internal = useGameInternal();
  if (!internal) return null;
  return (
    <>
      <Vitrina open={internal.vitrinaOpen} onOpenChange={internal.setVitrinaOpen} badges={view.badges} operator={view.operator} streak={view.streak} />
      <CauseChain />
      <CeremonyLayer />
    </>
  );
}
