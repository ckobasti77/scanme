"use client";

import { useEffect, useState } from "react";
import { AdminDashboardFoundation, type AdminDashboardFixture } from "@/components/admin/admin-dashboard-foundation";
import { useGameApi } from "@/components/admin/game/game-context";

// Dev preview only: shows the first fixture, then the second one after `delayMs`,
// so the change of the data (a resolved item, a new item) can be watched and
// recorded. The step is written on <html> for the capture script.
export function DashboardPreviewSteps({
  fixtures,
  delayMs,
  previewAim,
}: {
  fixtures: [AdminDashboardFixture, AdminDashboardFixture];
  delayMs: number;
  previewAim?: string;
}) {
  const [step, setStep] = useState<0 | 1>(0);
  const { preview } = useGameApi();
  // V4: a step that takes an item off the list is an item the TEST operator solved (XP, a hit on the boss).
  const solved = fixtures[1].reactions.all.items.length < fixtures[0].reactions.all.items.length;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setStep(1);
      if (solved) preview?.act("resolved");
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, solved, preview]);

  useEffect(() => {
    document.documentElement.dataset.previewStep = String(step);
    return () => {
      delete document.documentElement.dataset.previewStep;
    };
  }, [step]);

  const fixture = fixtures[step];
  return <AdminDashboardFoundation initialNow={fixture.now} fixture={fixture} previewAim={previewAim} />;
}
