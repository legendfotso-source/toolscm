import type { Metadata } from "next";
import { PasswordReset } from "@/components/PasswordReset";

export const metadata: Metadata = {
  title: "Mot de passe oublié — Tools.cm",
  robots: { index: false, follow: true },
};

export default function ResetPasswordPage() {
  return <PasswordReset step="request" />;
}
