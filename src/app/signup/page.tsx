import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Créer un compte — Tools.cm",
  description: "Créez un compte Tools.cm pour gérer un abonnement Pro.",
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return <AuthForm mode="signup" />;
}
