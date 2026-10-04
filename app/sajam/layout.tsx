import type { Metadata } from "next";
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
  return children;
}
