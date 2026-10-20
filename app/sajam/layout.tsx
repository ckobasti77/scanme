import type { Metadata } from "next";
import { FairPaperTexture } from "@/components/fair/fair-paper-texture";
import "./fair-event.css";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function FairLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <FairPaperTexture />
    </>
  );
}
