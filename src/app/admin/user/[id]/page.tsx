import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { currentRole } from "@/lib/admin";
import { userDetail } from "@/lib/admin-users";
import { UserDetailView } from "@/components/admin/UserDetailView";

export const metadata: Metadata = {
  title: "Compte — Administration",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // notFound() rather than a redirect or a 403, like every other admin route
  // here: somebody who is not an administrator learns nothing, including
  // whether this account exists.
  const role = await currentRole();
  if (role === "user") notFound();

  const { id } = await params;
  const detail = await userDetail(id);
  if (!detail) notFound();

  return <UserDetailView detail={detail} role={role} />;
}
