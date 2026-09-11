"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { adminV1Sr } from "@/lib/i18n/sr/admin-v1";
import { AdminLoadingState, AdminPanel } from "./admin-primitives";

export function AdminGuard({ children }: { children: ReactNode }) {
  const me = useQuery(api.admin.me);
  const { signOut } = useAuthActions();

  if (me === undefined) {
    return (
      <div className="admin-v1 grid min-h-[100dvh] place-items-center bg-[var(--admin-canvas)] p-4">
        <AdminPanel className="w-full max-w-lg">
          <AdminLoadingState label={adminV1Sr.accessLoading} />
        </AdminPanel>
      </div>
    );
  }
  if (!me.authenticated) {
    return (
      <AccessFrame title={adminV1Sr.signInRequiredTitle} body={adminV1Sr.signInRequiredBody}>
        <Link href="/admin/login" className="button-primary">{adminV1Sr.openSignIn}</Link>
      </AccessFrame>
    );
  }
  if (!me.isAdmin) {
    return (
      <AccessFrame title={adminV1Sr.accessDeniedTitle} body={adminV1Sr.accessDeniedBody}>
        <button type="button" className="button-secondary" onClick={() => void signOut()}>{adminV1Sr.signOutAccount}</button>
      </AccessFrame>
    );
  }
  return children;
}

function AccessFrame({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <main className="admin-v1 grid min-h-[100dvh] place-items-center bg-[var(--admin-canvas)] px-4 py-8">
      <AdminPanel className="w-full max-w-xl p-6 sm:p-10">
        <LockKeyhole className="size-8 text-[var(--admin-accent-ink)]" aria-hidden="true" />
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">{title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--admin-text-muted)]">{body}</p>
        <div className="mt-8">{children}</div>
      </AdminPanel>
    </main>
  );
}
