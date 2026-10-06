import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { fetchQuery } from "convex/nextjs";
import { ArrowUpRight, CarFront, Share2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { FairShareOpenRecorder } from "@/components/fair/garage/fair-share-open-recorder";
import { FAIR_SHARE_CODE_PATTERN, type FairPublicModel } from "@/lib/fair-contract";
import { fairShareCodeHash } from "@/lib/fair-server/sharing";
import { fmt } from "@/lib/i18n/format";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";
import "../../fair-event.css";
import styles from "./shared-collection.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ shareCode: string }> };

type SharedCollection = {
  id: string;
  eventId: string;
  eventModelIds: string[];
  expiresAt: number;
  models: FairPublicModel[];
};

async function readCollection(shareCode: string): Promise<SharedCollection | null> {
  if (!FAIR_SHARE_CODE_PATTERN.test(shareCode)) return null;
  try {
    const collection = await fetchQuery(api.fairSharing.getShareCollectionByCodeHash, {
      codeHash: fairShareCodeHash(shareCode),
      now: Date.now(),
    });
    if (!collection) return null;
    const models = await fetchQuery(api.fairPublic.getModelsByIds, { ids: collection.eventModelIds });
    return { ...collection, models };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareCode } = await params;
  const collection = await readCollection(shareCode);
  if (!collection || collection.models.length === 0) {
    return { title: dict.sharedCollectionExpired, robots: { index: false, follow: false } };
  }
  const first = collection.models[0];
  const names = collection.models.slice(0, 3).map((model) => `${model.brandName} ${model.displayName}`);
  const remainder = collection.models.length - names.length;
  const description = `${names.join(", ")}${remainder > 0 ? ` ${fmt(dict.sharedCollectionMore, { count: remainder })}` : ""}.`;
  return {
    title: `${dict.sharedCollectionTitle} | ${first.eventTitle}`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: dict.sharedCollectionTitle,
      description,
      type: "website",
      ...(first.photoUrl ? { images: [{ url: first.photoUrl, alt: `${first.brandName} ${first.displayName}` }] } : {}),
    },
  };
}

function Header({ eventSlug, eventTitle }: { eventSlug?: string; eventTitle?: string }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href={eventSlug ? `/sajam/${eventSlug}` : "/sajam/garaza"} className={styles.brand}>
          <span><strong>{dict.umbrellaTitle}</strong><small>{eventTitle ?? dict.sharedCollectionPartner}</small></span>
        </Link>
        <Link href="/sajam/garaza" className={styles.garageLink}><CarFront aria-hidden="true" />{dict.garageNav}</Link>
      </div>
    </header>
  );
}

export default async function SharedCollectionPage({ params }: Props) {
  const { shareCode } = await params;
  const collection = await readCollection(shareCode);
  const first = collection?.models[0];

  if (!collection || !first || collection.models.length === 0) {
    return (
      <div className={`fair-event ${styles.page}`} data-reveal="off">
        <Header />
        <main className={styles.expired}>
          <div><Share2 aria-hidden="true" /><h1>{dict.sharedCollectionExpired}</h1><p>{dict.sharedCollectionBody}</p><Link href="/sajam/garaza" className={styles.backLink}><CarFront aria-hidden="true" />{dict.sharedCollectionBack}</Link></div>
        </main>
      </div>
    );
  }

  return (
    <div className={`fair-event ${styles.page}`} data-reveal="off">
      <FairShareOpenRecorder collectionId={collection.id} />
      <Header eventSlug={first.eventSlug} eventTitle={first.eventTitle} />
      <main className={styles.main}>
        <div className={styles.intro}><span>{first.eventTitle}</span><h1>{dict.sharedCollectionTitle}</h1><p>{dict.sharedCollectionBody}</p></div>
        <section className={styles.grid} aria-label={dict.sharedCollectionTitle}>
          {collection.models.map((model) => (
            <article className={styles.card} key={model.id}>
              <div className={styles.visual}>
                {model.photoUrl ? <Image fill sizes="(max-width: 679px) 42vw, 230px" src={model.photoUrl} alt={fmt(dict.modelPhotoAlt, { brand: model.brandName, model: model.displayName })} /> : <span className={styles.placeholder}><CarFront aria-hidden="true" /></span>}
              </div>
              <div className={styles.copy}>
                <small>{model.brandName}</small><h2>{model.displayName}</h2><p>{model.priceText}</p>
                <Link href={`/sajam/${model.eventSlug}/model/${model.slug}`}>{dict.viewModel}<ArrowUpRight aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </section>
        <Link href="/sajam/garaza" className={styles.backLink}><CarFront aria-hidden="true" />{dict.sharedCollectionBack}</Link>
      </main>
    </div>
  );
}
