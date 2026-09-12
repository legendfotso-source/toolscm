import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { getAdminStats, getAudience, getMembers, isAdmin } from "@/lib/admin";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // notFound() rather than a redirect or a 403: someone who is not an admin
  // learns nothing about whether this page exists.
  if (!(await isAdmin())) notFound();

  const [stats, settings, audience, members] = await Promise.all([
    getAdminStats(),
    getSettings(),
    getAudience(),
    getMembers(),
  ]);
  if (!stats) notFound();

  return (
    <AdminDashboard stats={stats} settings={settings} audience={audience} members={members} />
  );
}
