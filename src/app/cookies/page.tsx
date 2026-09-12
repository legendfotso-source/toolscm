import type { Metadata } from "next";
import { LegalContent, type LegalDocument } from "@/components/LegalContent";

export const metadata: Metadata = {
  title: "Cookies",
  description:
    "Tools.cm n'utilise aujourd'hui aucun cookie de suivi. Cette page détaille le seul élément enregistré dans votre navigateur.",
  alternates: { canonical: "/cookies" },
};

const document: LegalDocument = {
  title: { fr: "Cookies", en: "Cookies" },
  intro: {
    fr: "La réponse courte : Tools.cm n'utilise aujourd'hui aucun cookie, et rien qui serve à vous suivre.",
    en: "The short answer: Tools.cm uses no cookies today, and nothing that serves to track you.",
  },
  updated: "8 septembre 2026",
  sections: [
    {
      heading: { fr: "Ce que nous enregistrons", en: "What we store" },
      body: {
        fr: [
          "Un seul élément, et ce n'est techniquement pas un cookie : la langue que vous avez choisie, gardée dans le stockage local de votre navigateur sous la clé « toolscm.locale ». Contrairement à un cookie, cette valeur n'est jamais envoyée avec vos requêtes ; elle est simplement relue par la page pour l'afficher dans la bonne langue.",
          "Vous pouvez l'effacer à tout moment en vidant les données de site de votre navigateur. Le site continuera de fonctionner et repartira sur le français par défaut.",
        ],
        en: [
          "One thing, and technically it is not a cookie: the language you chose, kept in your browser's local storage under the key \"toolscm.locale\". Unlike a cookie, that value is never sent with your requests; the page simply reads it back to display the right language.",
          "You can clear it at any time by clearing your browser's site data. The site will keep working and will fall back to French.",
        ],
      },
    },
    {
      heading: { fr: "Ce que nous n'utilisons pas", en: "What we do not use" },
      body: {
        fr: [
          "Pas de cookie de suivi, pas de pixel de mesure, pas d'identifiant publicitaire, pas de Google Analytics ni d'équivalent, pas de bouton de réseau social qui vous suit d'un site à l'autre.",
          "C'est aussi pourquoi vous ne voyez pas de bandeau de consentement : il n'y a rien à consentir.",
        ],
        en: [
          "No tracking cookie, no measurement pixel, no advertising identifier, no Google Analytics or equivalent, no social network button that follows you from site to site.",
          "That is also why you see no consent banner: there is nothing to consent to.",
        ],
      },
    },
    {
      heading: { fr: "Si cela change", en: "If this changes" },
      body: {
        fr: [
          "L'ajout d'une mesure d'audience ou d'une régie publicitaire impliquerait des cookies. Le cas échéant, cette page serait mise à jour avant leur mise en service, et un mécanisme de consentement serait mis en place là où la loi l'exige.",
        ],
        en: [
          "Adding analytics or an ad network would involve cookies. Should that happen, this page would be updated before they go live, and a consent mechanism would be put in place where the law requires it.",
        ],
      },
    },
  ],
};

export default function CookiesPage() {
  return <LegalContent document={document} />;
}
