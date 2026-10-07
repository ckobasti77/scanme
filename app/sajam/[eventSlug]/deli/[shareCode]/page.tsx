import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight, CarFront, Share2 } from "lucide-react";
import { FairEventShell } from "@/components/fair/event-shell";
import { FairShareOpenRecorder } from "@/components/fair/garage/fair-share-open-recorder";
import { fairGarageEventId, fairGarageEventTitle } from "@/lib/fair-client/garage-view";
import { fairPublicEventSlug } from "@/lib/fair-public-event";
import { fairGarageDefinition, loadFairGarageEventSummary } from "@/lib/fair-server/garage-page";
import { readFairSharedCollection } from "@/lib/fair-server/shared-collection";
import { fairEventThemeClass } from "@/lib/fair-theme";
import { fmt } from "@/lib/i18n/format";
import { fairGarageSr as dict } from "@/lib/i18n/sr/fair-garage";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
import styles from "./shared-collection.module.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ eventSlug: string; shareCode: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareCode } = await params;
  const collection = await readFairSharedCollection(shareCode);
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

export default async function SharedCollectionPage({ params }: Props) {
  const { eventSlug, shareCode } = await params;
  const definition = fairGarageDefinition(eventSlug);
  if (!definition) notFound();
  const [collection, event] = await Promise.all([
    readFairSharedCollection(shareCode),
    loadFairGarageEventSummary(definition),
  ]);
  const first = collection?.models[0];

  // A collection belongs to one event; a link under another event slug is
  // sent to the collection's own event so the theme and navigation match.
  if (first && fairPublicEventSlug(first.eventSlug) !== definition.publicSlug) {
    redirect(`/sajam/${fairPublicEventSlug(first.eventSlug)}/deli/${shareCode}`);
  }

  const garageHref = `/sajam/${eventSlug}/garaza`;
  const shell = (
    <FairEventShell
      eventId={fairGarageEventId(event)}
      eventSlug={eventSlug}
      eventTitle={dict.umbrellaTitle}
      eventName={fairGarageEventTitle(event)}
      dict={fairModelSr}
    />
  );

  if (!collection || !first || collection.models.length === 0) {
    return (
      <div className={`fair-event ${fairEventThemeClass(eventSlug)} ${styles.page}`} data-reveal="off">
        {shell}
        <main className={styles.expired}>
          <div><Share2 aria-hidden="true" /><h1>{dict.sharedCollectionExpired}</h1><p>{dict.sharedCollectionBody}</p><Link href={garageHref} className={styles.backLink}><CarFront aria-hidden="true" />{dict.sharedCollectionBack}</Link></div>
        </main>
      </div>
    );
  }

  return (
    <div className={`fair-event ${fairEventThemeClass(eventSlug)} ${styles.page}`} data-reveal="off">
      <FairShareOpenRecorder collectionId={collection.id} />
      {shell}
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
                <Link href={`/sajam/${fairPublicEventSlug(model.eventSlug)}/model/${model.slug}`}>{dict.viewModel}<ArrowUpRight aria-hidden="true" /></Link>
              </div>
            </article>
          ))}
        </section>
        <Link href={garageHref} className={styles.backLink}><CarFront aria-hidden="true" />{dict.sharedCollectionBack}</Link>
      </main>
    </div>
  );
}
