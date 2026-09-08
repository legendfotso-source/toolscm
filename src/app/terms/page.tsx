import type { Metadata } from "next";
import { LegalContent, type LegalDocument } from "@/components/LegalContent";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Conditions d'utilisation — Tools.cm",
  description:
    "Les conditions d'utilisation de Tools.cm : ce que le service fait, ce qu'il ne garantit pas, et vos responsabilités.",
  alternates: { canonical: "/terms" },
};

const document: LegalDocument = {
  title: { fr: "Conditions d'utilisation", en: "Terms of use" },
  intro: {
    fr: "En utilisant Tools.cm, vous acceptez les conditions ci-dessous. Elles sont volontairement courtes et écrites pour être comprises.",
    en: "By using Tools.cm you accept the terms below. They are deliberately short and written to be understood.",
  },
  updated: "8 septembre 2026",
  sections: [
    {
      heading: { fr: "Le service", en: "The service" },
      body: {
        fr: [
          "Tools.cm met à disposition des outils de traitement de fichiers PDF et image qui s'exécutent dans votre navigateur. L'usage gratuit ne demande pas de compte.",
          "Nous publions un outil uniquement lorsqu'il fonctionne réellement. Un outil marqué « Bientôt disponible » n'est pas utilisable, et nous ne simulons jamais un traitement.",
        ],
        en: [
          "Tools.cm provides PDF and image processing tools that run in your browser. Free use requires no account.",
          "We publish a tool only once it genuinely works. A tool marked \"Coming soon\" is not usable, and we never simulate processing.",
        ],
      },
    },
    {
      heading: { fr: "Ce que vous en faites", en: "What you do with it" },
      body: {
        fr: [
          "Vous êtes responsable des fichiers que vous traitez. Vous vous engagez à n'utiliser Tools.cm que pour des documents que vous avez le droit de manipuler.",
          "Il est interdit d'utiliser le service pour produire des documents frauduleux, contourner la protection d'un fichier qui ne vous appartient pas, ou porter atteinte aux droits d'un tiers.",
        ],
        en: [
          "You are responsible for the files you process. You undertake to use Tools.cm only for documents you have the right to handle.",
          "It is forbidden to use the service to produce fraudulent documents, to bypass the protection of a file that is not yours, or to infringe anyone's rights.",
        ],
      },
    },
    {
      heading: { fr: "Ce que nous ne garantissons pas", en: "What we do not guarantee" },
      body: {
        fr: [
          "Le traitement a lieu sur votre appareil. Sa vitesse, la taille maximale des fichiers et la réussite de l'opération dépendent de votre téléphone ou ordinateur, de sa mémoire et de votre navigateur. Sur un appareil ancien, certaines opérations peuvent échouer ; nous vous le disons alors clairement.",
          "L'outil « Photo d'identité » produit une image aux dimensions exactes que vous demandez. Il ne garantit pas la conformité à une exigence administrative particulière : les règles de cadrage, de fond, d'expression et d'ancienneté varient selon le pays et l'institution, et il vous revient de vérifier les consignes officielles.",
          "La compression ne peut pas garantir une taille de fichier précise. Le résultat dépend entièrement du contenu du document, et nous affichons toujours la taille réellement obtenue.",
          "Le service est fourni « en l'état ». Nous ne pouvons pas garantir une disponibilité ininterrompue, et nous ne sommes pas responsables de la perte d'un fichier : conservez toujours votre original.",
        ],
        en: [
          "Processing happens on your device. Its speed, the maximum file size and whether the operation succeeds at all depend on your phone or computer, its memory and your browser. On an older device some operations may fail; we tell you plainly when they do.",
          "The \"Passport photo\" tool produces an image at exactly the dimensions you request. It does not guarantee compliance with any particular administrative requirement: framing, background, expression and recency rules vary by country and institution, and it is up to you to check the official instructions.",
          "Compression cannot guarantee a precise file size. The result depends entirely on the document's content, and we always show the size actually achieved.",
          "The service is provided \"as is\". We cannot guarantee uninterrupted availability, and we are not responsible for the loss of a file: always keep your original.",
        ],
      },
    },
    {
      heading: { fr: "Abonnement Pro", en: "Pro subscription" },
      body: {
        fr: [
          "L'abonnement Pro n'est pas encore disponible. Lorsqu'il le sera, ses conditions — prix, durée, renouvellement, remboursement — seront précisées ici avant toute mise en service, et aucun paiement ne sera accepté avant cela.",
        ],
        en: [
          "The Pro subscription is not available yet. When it is, its terms — price, duration, renewal, refunds — will be set out here before it goes live, and no payment will be accepted before then.",
        ],
      },
    },
    {
      heading: { fr: "Évolution et contact", en: "Changes and contact" },
      body: {
        fr: [
          "Ces conditions peuvent évoluer avec le service. La date de mise à jour en haut de page indique la version en vigueur.",
          `Pour toute question : ${SUPPORT_EMAIL}.`,
        ],
        en: [
          "These terms may change as the service does. The update date at the top of this page indicates the version in force.",
          `For any question: ${SUPPORT_EMAIL}.`,
        ],
      },
    },
  ],
};

export default function TermsPage() {
  return <LegalContent document={document} />;
}
