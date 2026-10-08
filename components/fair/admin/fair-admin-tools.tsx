import { cookies } from "next/headers";
import { fairAdminPreview, fairIsAdminRequest } from "@/lib/fair-server/admin-session";
import {
  FAIR_VISITOR_COOKIE_NAME,
  fairVisitorEnv,
  fairVisitorHash,
  isFairVisitorToken,
  resolveFairVisitorSecret,
} from "@/lib/fair-server/visitor";
import { fairAdminDevSr as dict } from "@/lib/i18n/sr/fair-admin-dev";
import type { FairAdminDevSheetProps } from "./fair-admin-dev-sheet";
import { FairAdminDevLoader } from "./fair-admin-dev-loader";

// Server gate of the admin DEV tools (JOVAN-DELTA 2026-10-09): renders the
// "ADMIN PREGLED" bar and the DEV sheet only for a verified admin session.
// For everyone else it renders nothing, so the client sheet is never sent.

function shortVisitor(): Promise<string> {
  return cookies().then((store) => {
    const token = store.get(FAIR_VISITOR_COOKIE_NAME)?.value;
    const secret = resolveFairVisitorSecret(fairVisitorEnv());
    if (!token || !isFairVisitorToken(token) || !("secret" in secret)) return dict.stateNone;
    const hash = fairVisitorHash(token, secret.secret);
    return `v_${hash.slice(0, 4)}…${hash.slice(-3)}`;
  });
}

function database() {
  const host = process.env.NEXT_PUBLIC_CONVEX_URL ? new URL(process.env.NEXT_PUBLIC_CONVEX_URL).hostname.split(".")[0] : dict.stateNone;
  return `${process.env.VERCEL_ENV === "production" ? "PROD" : "DEV"} ${host}`;
}

export async function FairAdminTools(props: Pick<FairAdminDevSheetProps, "event" | "model" | "brandName">) {
  if (!(await fairIsAdminRequest())) return null;
  const [preview, visitor] = await Promise.all([fairAdminPreview(), shortVisitor()]);
  return (
    <>
      <div className="fair-admin-bar" role="note">{dict.bar}</div>
      <FairAdminDevLoader
        {...props}
        dict={dict}
        preview={preview}
        visitor={visitor}
        database={database()}
        build={process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || dict.stateLocalBuild}
      />
    </>
  );
}
