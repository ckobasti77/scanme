"use client";

import { AdminGuard } from "@/components/admin/admin-guard";
import { AdminShell } from "@/components/admin/admin-shell";
import { MenuAdminSubpage } from "@/components/admin/menu-admin-subpage";
import type { Id } from "@/convex/_generated/dataModel";
import { menuAdminSr as dict } from "@/lib/i18n/sr/menu-admin";

export function MenuAdminPreview({ businessId }: { businessId: string | null }) {
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
