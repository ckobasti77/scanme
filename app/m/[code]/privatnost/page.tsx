// /m/[code]/privatnost — the Memories privacy policy (TASK-20 STEP 5), linked
// from the consent notice. Server component: static product copy keyed by the
// space's plan so the retention window is concrete. Not legal advice — needs a
// lawyer's review before launch.

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ChevronLeft } from "lucide-react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { privacySr as dict } from "@/lib/i18n/sr/privacy";
import { CONSENT_VERSION } from "@/lib/i18n/sr/consent";
import {
  MemoriesFooterBrand,
  MemoriesMasthead,
  MemoriesShell,
} from "@/components/memories/memories-chrome";
import styles from "@/components/memories/memories.module.css";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#171310",
  viewportFit: "cover",
};

const getView = cache(async (code: string) =>
  fetchQuery(api.memories.guestSpaceView, { code }),
);

export async function generateMetadata({
  params,
}: PageProps<"/m/[code]/privatnost">): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  const robots = { index: false, follow: false };
  if (!code) return { robots };
  const view = await getView(code);
  if (!view) return { robots };
  return { title: fmt(dict.metaTitle, { name: view.spaceName }), robots };
}

export default async function MemoriesPrivacyPage({
  params,
}: PageProps<"/m/[code]/privatnost">) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) notFound();
  const view = await getView(code);
  if (!view) notFound();
  const days = view.retentionDays ?? 30;

  return (
    <MemoriesShell>
      <MemoriesMasthead
        spaceName={view.spaceName}
        businessName={view.businessName}
        logoUrl={view.businessLogoUrl}
      />
      <h2 className={styles.pageTitle}>{dict.title}</h2>
      <p className={styles.privacyLead}>{dict.intro}</p>

      <h3 className={styles.privacyHeading}>{dict.lawfulHeading}</h3>

      <h4 className={styles.privacySubHeading}>{dict.photosHeading}</h4>
      <p className={styles.privacyText}>{dict.photosBody}</p>
      <p className={styles.privacyText}>{dict.visibilityBody}</p>
      <p className={styles.privacyText}>{dict.archiveBody}</p>

      <h4 className={styles.privacySubHeading}>{dict.cookieHeading}</h4>
      <p className={styles.privacyText}>{dict.cookieBody}</p>

      <h4 className={styles.privacySubHeading}>{dict.analyticsHeading}</h4>
      <p className={styles.privacyText}>{dict.analyticsBody}</p>

      <h3 className={styles.privacyHeading}>{dict.retentionHeading}</h3>
      <p className={styles.privacyText}>{fmt(dict.retentionBody, { days })}</p>
      <p className={styles.privacyText}>{dict.retentionTiers}</p>

      <h3 className={styles.privacyHeading}>{dict.deleteHeading}</h3>
      <p className={styles.privacyText}>{dict.deleteBody}</p>
      <p className={styles.privacyText}>{dict.deleteKeyNote}</p>

      <h3 className={styles.privacyHeading}>{dict.controllerHeading}</h3>
      <p className={styles.privacyText}>{dict.controllerBody}</p>

      <p className={styles.privacyMeta}>
        {fmt(dict.updatedLabel, { version: CONSENT_VERSION })}
      </p>

      <nav className={styles.footerNav}>
        <Link className={styles.navLink} href={`/m/${code}`}>
          <ChevronLeft
            className={styles.navLinkArrow}
            size={20}
            aria-hidden="true"
          />
          {dict.backLink}
        </Link>
      </nav>
      <MemoriesFooterBrand />
    </MemoriesShell>
  );
}
