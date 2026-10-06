import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDashboard } from "@/components/AdminDashboard";
import { currentRole, getAdminStats, getAudience, getMembers } from "@/lib/admin";
import { runHealthChecks } from "@/lib/health";
import { AdminUnavailable } from "@/components/AdminUnavailable";
import { HealthPanel } from "@/components/HealthPanel";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // notFound() rather than a redirect or a 403: someone who is not an admin
  // learns nothing about whether this page exists.
  const role = await currentRole();
  if (role === "user") notFound();

  const [stats, settings, audience, members, health] = await Promise.all([
    getAdminStats(),
    getSettings(),
    getAudience(),
    getMembers(),
    runHealthChecks(),
  ]);

  // Rendered here, on the server. The checks carry provider error text and
  // key shapes, so they must not cross into a client bundle as data.
  const healthPanel = <HealthPanel checks={health} role={role} />;

  // The second lock, and the one that kept the door shut after the first was
  // opened. `getAdminStats()` returns null when the service-role client cannot
  // read, and answering that with notFound() gave the owner the same 404 as a
  // stranger — for a database fault, on the page whose job is to show him
  // database faults. Now the page renders either way: without figures when
  // they cannot be read, and with the health checks that say why.
  if (!stats) {
    return <AdminUnavailable health={healthPanel} />;
  }

  return (
    <AdminDashboard
      stats={stats}
      settings={settings}
      audience={audience}
      members={members}
      health={healthPanel}
      role={role}
    />
  );
}
