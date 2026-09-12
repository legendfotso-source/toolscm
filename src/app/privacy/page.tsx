import type { Metadata } from "next";
import { LegalContent, type LegalDocument } from "@/components/LegalContent";
import { SUPPORT_EMAIL } from "@/lib/site";
import { MODEL_HOST } from "@/lib/tools/segmentation";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Tools.cm traite vos fichiers : traitement local dans le navigateur, aucun stockage de documents, et ce qui est réellement transmis.",
  alternates: { canonical: "/privacy" },
};

const UPDATED = "8 septembre 2026";

/**
 * This document describes the architecture as it actually is today. It claims
 * nothing the code does not do — including the one third-party request the
 * background tools make, which is stated rather than glossed over.
 */
const document: LegalDocument = {
  title: { fr: "Politique de confidentialité", en: "Privacy policy" },
  intro: {
    fr: "Tools.cm est conçu pour que vos documents n'aient aucune raison de quitter votre appareil. Cette page décrit exactement ce qui se passe lorsque vous utilisez le site — y compris les rares cas où une requête part vers un tiers.",
    en: "Tools.cm is built so that your documents have no reason to leave your device. This page describes exactly what happens when you use the site — including the rare cases where a request does go to a third party.",
  },
  updated: UPDATED,
  sections: [
    {
      heading: { fr: "Vos fichiers", en: "Your files" },
      body: {
        fr: [
          "Tous les outils publiés sur Tools.cm traitent vos fichiers directement dans votre navigateur. Lorsque vous choisissez un PDF ou une photo, le fichier est lu par le code qui s'exécute sur votre appareil ; il n'est pas téléversé vers nos serveurs.",
          "Nous ne recevons donc jamais le contenu de vos documents : ni PDF, ni CV, ni photo d'identité, ni relevé, ni acte administratif. Nous ne pouvons pas les lire, les conserver ni les transmettre, parce qu'ils ne nous parviennent tout simplement pas.",
          "Le fichier que vous téléchargez à la fin est généré sur votre appareil. Lorsque vous quittez la page ou la rechargez, il ne reste rien : rien n'est enregistré sur nos serveurs, et rien n'est conservé dans votre navigateur au-delà de la session en cours.",
        ],
        en: [
          "Every tool published on Tools.cm processes your files directly in your browser. When you choose a PDF or a photo, the file is read by code running on your device; it is not uploaded to our servers.",
          "We therefore never receive the contents of your documents: no PDF, no CV, no ID photo, no statement, no official paper. We cannot read them, keep them or pass them on, because they simply never reach us.",
          "The file you download at the end is generated on your device. When you leave or reload the page nothing remains: nothing is saved on our servers, and nothing is kept in your browser beyond the current session.",
        ],
      },
    },
    {
      heading: {
        fr: "L'exception : le modèle de détourage",
        en: "The exception: the background-removal model",
      },
      body: {
        fr: [
          `Deux outils — « Supprimer l'arrière-plan » et « Flouter l'arrière-plan » — utilisent un modèle d'intelligence artificielle qui reconnaît le sujet d'une photo. Ce modèle pèse environ 40 Mo et est téléchargé depuis ${MODEL_HOST}, un service tiers, lors de votre première utilisation, puis conservé en cache par votre navigateur.`,
          "C'est le modèle qui vient jusqu'à votre appareil, pas votre photo qui part. Votre image n'est à aucun moment envoyée à ce service ni à nous. En revanche, comme pour tout téléchargement sur Internet, l'hébergeur de ce fichier voit votre adresse IP et les informations techniques habituelles de votre navigateur.",
          "Si vous préférez éviter cette requête, n'utilisez pas ces deux outils : tous les autres fonctionnent sans aucune ressource externe.",
        ],
        en: [
          `Two tools — "Remove background" and "Blur background" — use an AI model that recognises the subject of a photo. That model weighs about 40 MB and is downloaded from ${MODEL_HOST}, a third-party service, the first time you use it, then cached by your browser.`,
          "It is the model that comes to your device, not your photo that leaves. Your image is at no point sent to that service or to us. That said, as with any download on the internet, the host of that file sees your IP address and the usual technical information about your browser.",
          "If you would rather avoid that request, do not use these two tools: every other tool works with no external resource at all.",
        ],
      },
    },
    {
      heading: { fr: "Ce que nous stockons dans votre navigateur", en: "What we store in your browser" },
      body: {
        fr: [
          "Une seule chose : la langue que vous avez choisie, enregistrée dans le stockage local de votre navigateur sous la clé « toolscm.locale ». Elle ne nous est pas transmise et sert uniquement à afficher le site dans la bonne langue à votre prochaine visite.",
          "Nous n'utilisons aujourd'hui aucun cookie de suivi, aucun identifiant publicitaire et aucun outil de mesure d'audience tiers.",
        ],
        en: [
          "One thing only: the language you chose, saved in your browser's local storage under the key \"toolscm.locale\". It is not sent to us and only serves to show the site in the right language on your next visit.",
          "We currently use no tracking cookie, no advertising identifier and no third-party analytics tool.",
        ],
      },
    },
    {
      heading: { fr: "Journaux d'hébergement", en: "Hosting logs" },
      body: {
        fr: [
          "Le site est servi par un hébergeur qui, comme tout serveur web, enregistre techniquement les requêtes reçues : adresse IP, date, page demandée, navigateur. Ces journaux servent au fonctionnement et à la sécurité du service et ne contiennent aucun contenu de fichier, puisque aucun fichier ne nous est envoyé.",
        ],
        en: [
          "The site is served by a hosting provider which, like any web server, technically records incoming requests: IP address, time, page requested, browser. These logs exist for the operation and security of the service and contain no file content, since no file is ever sent to us.",
        ],
      },
    },
    {
      heading: { fr: "Comptes et paiements", en: "Accounts and payments" },
      body: {
        fr: [
          "L'usage gratuit ne demande aucun compte et nous ne collectons donc aucune donnée personnelle pour vous laisser utiliser les outils.",
          "L'abonnement Pro n'est pas encore actif. Lorsqu'il le sera, il demandera une adresse email pour gérer l'abonnement, et le paiement sera traité par un prestataire de paiement. Nous ne verrons jamais votre numéro de carte ni le code de votre transaction Mobile Money : ces informations restent chez le prestataire. Cette page sera mise à jour avant toute activation.",
        ],
        en: [
          "Free use requires no account, so we collect no personal data in order to let you use the tools.",
          "The Pro subscription is not live yet. When it is, it will require an email address to manage the subscription, and payment will be handled by a payment provider. We will never see your card number or your Mobile Money transaction code: that information stays with the provider. This page will be updated before any activation.",
        ],
      },
    },
    {
      heading: { fr: "Publicité", en: "Advertising" },
      body: {
        fr: [
          "Aucune publicité n'est affichée aujourd'hui et aucune régie n'est branchée. Si nous en intégrons une, elle sera visible, cette page sera mise à jour pour décrire ce qu'elle collecte, et les abonnés Pro ne la verront pas.",
        ],
        en: [
          "No advertising is shown today and no ad network is connected. If we integrate one it will be visible, this page will be updated to describe what it collects, and Pro subscribers will not see it.",
        ],
      },
    },
    {
      heading: { fr: "Vos droits et nous contacter", en: "Your rights and contacting us" },
      body: {
        fr: [
          "Comme nous ne détenons pas vos documents, il n'y a rien à supprimer de notre côté les concernant. Pour toute question sur cette politique, ou pour exercer un droit d'accès, de rectification ou de suppression sur une donnée que vous nous auriez transmise (par exemple via le formulaire de contact), écrivez-nous à " + SUPPORT_EMAIL + ".",
        ],
        en: [
          "Since we do not hold your documents, there is nothing on our side to delete about them. For any question about this policy, or to exercise a right of access, correction or deletion over data you have sent us (through the contact form, for instance), write to us at " + SUPPORT_EMAIL + ".",
        ],
      },
    },
  ],
};

export default function PrivacyPage() {
  return <LegalContent document={document} />;
}
