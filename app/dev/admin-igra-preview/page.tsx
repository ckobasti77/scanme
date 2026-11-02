import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { gameFixture } from "@/components/admin/game/game-fixtures";
import { GamePreviewPage } from "@/components/admin/game/game-preview-page";
import { adminTitle } from "@/lib/admin-v2/frame/titles";
import { adminGameSr } from "@/lib/i18n/sr/admin-game";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";

export const metadata: Metadata = { title: adminTitle(adminGameSr.demo.title), robots: { index: false, follow: false } };

const MAX_PARAM_LENGTH = 24;

// ADMIN v3 V4 — the states of the game with TEST data (dev only; nothing is read, nothing is stored).
//   ?igra=nivo|rang|znacka|epska|sef|kombo|rekord|vise|vitrina|zaostatak  presses that button after the load;
//   ?stanje=nivo|rang|mirno|pocetak                                       picks the TEST operator the page starts with
//   (`?igra=rang` starts with the operator one item short of a new rank; `mirno` is far from a new level, so
//   a button shows only its own ceremony).
export default async function AdminGamePreviewPage({ searchParams }: { searchParams: Promise<{ igra?: string; stanje?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { igra: requested, stanje } = await searchParams;
  const igra = requested && requested.length <= MAX_PARAM_LENGTH ? requested : undefined;
  const variant = stanje === "rang" || (stanje === undefined && igra === "rang") ? "rang" : stanje === "pocetak" || stanje === "mirno" ? stanje : "nivo";
  return (
    <AdminShell previewIdentity={adminV1Sr.fixtureIdentity} previewGame={gameFixture(variant)}>
      <GamePreviewPage igra={igra} />
    </AdminShell>
  );
}
