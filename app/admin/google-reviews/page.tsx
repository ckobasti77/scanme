import type { Metadata } from "next";
import { GoogleReviewsAdmin } from "@/components/admin/google-reviews-admin";

export const metadata: Metadata = { title: "Google Review kartice | ScanMe Admin", robots: { index: false, follow: false } };
export default function GoogleReviewsPage() { return <GoogleReviewsAdmin />; }
