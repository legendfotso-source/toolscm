import type { Metadata } from "next";
import { PasswordReset } from "@/components/PasswordReset";

export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  robots: { index: false, follow: false },
};

export default function SetPasswordPage() {
  return <PasswordReset step="set" />;
}
