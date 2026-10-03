import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eventMapSr as dict } from "@/lib/i18n/sr/event-map";
import { CairMap } from "./cair-map";

export const metadata: Metadata = {
  title: dict.metaTitle,
  description: dict.metaDescription,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SajamCairPage({
  searchParams,
}: {
  searchParams: Promise<{ ulaz?: string | string[] }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const entrance = params.ulaz === "sever" ? "north" : "south";

  return <CairMap initialEntrance={entrance} />;
}
