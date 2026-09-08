import type { Metadata, Viewport } from "next";
import "./globals.css";

import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Tools.cm — Outils PDF et image gratuits, simples et privés",
    template: "%s — Tools.cm",
  },
  description:
    "Compressez, fusionnez, convertissez et modifiez vos fichiers PDF et vos images directement dans votre navigateur. Gratuit, sans compte, et vos fichiers ne quittent pas votre appareil.",
  applicationName: SITE_NAME,
  keywords: [
    "compresser pdf",
    "fusionner pdf",
    "jpg en pdf",
    "supprimer arrière-plan",
    "compresser image",
    "outils pdf gratuits",
    "Cameroun",
  ],
  authors: [{ name: SITE_NAME }],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "fr_CM",
    alternateLocale: ["en_US"],
    url: SITE_URL,
    title: "Tools.cm — Outils PDF et image gratuits, simples et privés",
    description:
      "Vos fichiers. Votre appareil. Votre vie privée. Outils PDF et image qui fonctionnent depuis votre téléphone.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tools.cm — Outils PDF et image gratuits",
    description: "Vos fichiers. Votre appareil. Votre vie privée.",
  },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#6D28D9",
  width: "device-width",
  initialScale: 1,
  // Never block zoom: a lot of our users need it to read comfortably.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col bg-surface antialiased">
        <LocaleProvider>
          <a
            href="#main"
            className="sr-only rounded-lg bg-violet-deep px-4 py-2 text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
          >
            Aller au contenu principal
          </a>
          <Header />
          <main id="main" className="flex-1">
            {children}
          </main>
          <Footer />
          <ServiceWorker />
        </LocaleProvider>
      </body>
    </html>
  );
}
