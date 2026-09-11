import type { Metadata } from "next";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = {
  title: "Connexion — Tools.cm",
  description: "Connectez-vous pour gérer votre abonnement Pro Tools.cm.",
  // A sign-in page has nothing to offer a search result.
  robots: { index: false, follow: true },
};

export default function SignInPage() {
  return <AuthForm mode="signin" />;
}
