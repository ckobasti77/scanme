import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";

export const metadata: Metadata = { title: "Admin prijava | ScanMe", robots: { index: false, follow: false } };
export default function AdminLoginPage() { return <AdminLogin />; }
