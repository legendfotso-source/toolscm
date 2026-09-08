import type { ToolDefinition } from "@/types/tool";

const MB = 1024 * 1024;

export const utilityTools: ToolDefinition[] = [
  {
    id: "qr-generator",
    categories: ["utility"],
    status: "AVAILABLE",
    processingMode: "none",
    icon: "qr",
    multiple: false,
    mimeTypes: [],
    extensions: [],
    formatsLabel: "",
    maxFileSize: 0,
    name: { fr: "Générateur de QR code", en: "QR code generator" },
    short: {
      fr: "Créez un QR code pour un lien, un numéro WhatsApp ou un texte.",
      en: "Create a QR code for a link, a WhatsApp number or any text.",
    },
    h1: { fr: "Générer un QR code gratuitement", en: "Generate a QR code for free" },
    subtitle: {
      fr: "Entrez votre lien ou votre texte, téléchargez le QR code en PNG.",
      en: "Enter your link or text and download the QR code as a PNG.",
    },
    seoTitle: {
      fr: "Générateur de QR code gratuit — Tools.cm",
      en: "Free QR code generator — Tools.cm",
    },
    seoDescription: {
      fr: "Créez gratuitement un QR code pour un lien, un numéro WhatsApp ou un texte, directement dans votre navigateur.",
      en: "Create a QR code for a link, a WhatsApp number or text, free and directly in your browser.",
    },
    keywords: [
      "qr code",
      "generer qr",
      "creer qr code",
      "qr whatsapp",
      "qr generator",
      "make qr code",
    ],
    faq: [
      {
        q: {
          fr: "Le QR code expire-t-il ?",
          en: "Does the QR code expire?",
        },
        a: {
          fr: "Non. Le contenu est encodé directement dans l'image : il n'y a ni redirection ni compte chez nous. Le QR code fonctionnera tant que le lien qu'il contient existe.",
          en: "No. The content is encoded straight into the image: there is no redirect and no account on our side. The QR code works for as long as the link inside it exists.",
        },
      },
      {
        q: {
          fr: "Comment faire un QR code WhatsApp ?",
          en: "How do I make a WhatsApp QR code?",
        },
        a: {
          fr: "Utilisez un lien de la forme https://wa.me/237XXXXXXXXX en remplaçant par votre numéro au format international, sans le signe plus ni espaces. Le scan ouvre directement une conversation avec vous.",
          en: "Use a link of the form https://wa.me/237XXXXXXXXX with your number in international format, without the plus sign or spaces. Scanning it opens a conversation with you directly.",
        },
      },
    ],
    about: [
      {
        fr: "Un QR code sur une devanture, une carte de visite ou une affiche évite de faire saisir un numéro à la main. Le client scanne et arrive directement sur votre WhatsApp, votre page ou votre catalogue.",
        en: "A QR code on a shopfront, a business card or a poster saves people typing a number by hand. The customer scans and lands straight on your WhatsApp, your page or your catalogue.",
      },
      {
        fr: "Le code est généré dans votre navigateur : ce que vous encodez n'est envoyé nulle part et n'est enregistré nulle part.",
        en: "The code is generated in your browser: what you encode is sent nowhere and stored nowhere.",
      },
    ],
  },
  {
    id: "qr-reader",
    categories: ["utility"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "qrScan",
    multiple: false,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 20 * MB,
    name: { fr: "Lecteur de QR code", en: "QR code reader" },
    short: {
      fr: "Lisez le contenu d'un QR code depuis une capture d'écran ou une photo.",
      en: "Read what a QR code contains from a screenshot or a photo.",
    },
    h1: { fr: "Lire un QR code depuis une image", en: "Read a QR code from an image" },
    subtitle: {
      fr: "Déposez la capture, nous affichons le contenu du code.",
      en: "Drop the screenshot in and we show you what the code says.",
    },
    seoTitle: { fr: "Lire un QR code en ligne — Tools.cm", en: "Read a QR code online — Tools.cm" },
    seoDescription: {
      fr: "Décodez gratuitement un QR code à partir d'une image ou d'une capture d'écran, dans votre navigateur.",
      en: "Decode a QR code from an image or screenshot for free, in your browser.",
    },
    keywords: [
      "lire qr code",
      "scanner qr image",
      "decoder qr",
      "read qr code",
      "scan qr from image",
    ],
    faq: [
      {
        q: {
          fr: "Pourquoi lire un QR code sans le scanner ?",
          en: "Why read a QR code without scanning it?",
        },
        a: {
          fr: "Parce qu'un QR reçu en capture d'écran ne peut pas être scanné par le téléphone qui l'affiche. Et parce que voir le lien avant de l'ouvrir permet de repérer une adresse suspecte.",
          en: "Because a QR received as a screenshot cannot be scanned by the phone showing it. And because seeing the link before opening it lets you spot a suspicious address.",
        },
      },
      {
        q: {
          fr: "Ouvrez-vous le lien automatiquement ?",
          en: "Do you open the link automatically?",
        },
        a: {
          fr: "Non, jamais. Nous affichons le contenu en texte. C'est vous qui décidez de l'ouvrir ou non, en connaissance de cause.",
          en: "No, never. We show the content as text. You decide whether to open it, knowing what it is.",
        },
      },
    ],
    about: [
      {
        fr: "Les QR codes circulent beaucoup par WhatsApp, souvent en capture d'écran. Les décoder permet de voir où ils mènent avant de cliquer, ce qui est une précaution utile face aux liens frauduleux.",
        en: "QR codes travel widely over WhatsApp, often as screenshots. Decoding them shows where they lead before you click, a useful precaution against fraudulent links.",
      },
    ],
  },
  {
    id: "age-calculator",
    categories: ["utility"],
    status: "AVAILABLE",
    processingMode: "none",
    icon: "calendar",
    multiple: false,
    mimeTypes: [],
    extensions: [],
    formatsLabel: "",
    maxFileSize: 0,
    name: { fr: "Calculateur d'âge", en: "Age calculator" },
    short: {
      fr: "Calculez un âge exact en années, mois et jours à une date donnée.",
      en: "Work out an exact age in years, months and days at a given date.",
    },
    h1: { fr: "Calculer un âge exact", en: "Calculate an exact age" },
    subtitle: {
      fr: "Utile pour un dossier de concours avec une limite d'âge.",
      en: "Useful for an application with an age limit.",
    },
    seoTitle: { fr: "Calculateur d'âge — Tools.cm", en: "Age calculator — Tools.cm" },
    seoDescription: {
      fr: "Calculez gratuitement un âge exact en années, mois et jours à une date précise.",
      en: "Calculate an exact age in years, months and days at a precise date, for free.",
    },
    keywords: [
      "calculer age",
      "age exact",
      "limite age concours",
      "age calculator",
      "date of birth",
    ],
    faq: [
      {
        q: {
          fr: "Pourquoi choisir une date de référence ?",
          en: "Why pick a reference date?",
        },
        a: {
          fr: "Parce que les concours fixent souvent une limite d'âge « au 1er janvier » ou « à la date de clôture ». Ce n'est pas votre âge aujourd'hui qui compte, mais votre âge à cette date-là.",
          en: "Because competitive exams often set an age limit \"as of 1 January\" or \"at the closing date\". What counts is not your age today but your age on that date.",
        },
      },
    ],
    about: [
      {
        fr: "Les concours de la fonction publique et les recrutements imposent régulièrement une limite d'âge à une date précise. Un calcul approximatif peut coûter une candidature.",
        en: "Public service exams and recruitment drives regularly set an age limit at a precise date. An approximate calculation can cost an application.",
      },
    ],
  },
  {
    id: "word-counter",
    categories: ["utility"],
    status: "AVAILABLE",
    processingMode: "none",
    icon: "text",
    multiple: false,
    mimeTypes: [],
    extensions: [],
    formatsLabel: "",
    maxFileSize: 0,
    name: { fr: "Compteur de mots", en: "Word counter" },
    short: {
      fr: "Comptez mots, caractères, phrases et paragraphes en direct.",
      en: "Count words, characters, sentences and paragraphs live.",
    },
    h1: { fr: "Compter les mots d'un texte", en: "Count the words in a text" },
    subtitle: {
      fr: "Collez votre texte, les compteurs se mettent à jour immédiatement.",
      en: "Paste your text and the counters update immediately.",
    },
    seoTitle: { fr: "Compteur de mots gratuit — Tools.cm", en: "Free word counter — Tools.cm" },
    seoDescription: {
      fr: "Comptez gratuitement les mots et les caractères d'un texte, directement dans votre navigateur.",
      en: "Count the words and characters in a text for free, directly in your browser.",
    },
    keywords: [
      "compteur de mots",
      "compter mots",
      "nombre de caracteres",
      "word counter",
      "character count",
    ],
    faq: [
      {
        q: {
          fr: "Mon texte est-il envoyé quelque part ?",
          en: "Is my text sent anywhere?",
        },
        a: {
          fr: "Non. Le comptage se fait dans la page, au fur et à mesure de la frappe. Rien n'est transmis ni conservé.",
          en: "No. Counting happens in the page as you type. Nothing is transmitted or stored.",
        },
      },
    ],
    about: [
      {
        fr: "Une dissertation, une lettre de motivation ou une publication ont souvent une limite stricte de mots ou de caractères. Compter à la main est fastidieux et peu fiable.",
        en: "An essay, a cover letter or a post often carries a strict word or character limit. Counting by hand is tedious and unreliable.",
      },
    ],
  },
  {
    id: "case-converter",
    categories: ["utility"],
    status: "AVAILABLE",
    processingMode: "none",
    icon: "case",
    multiple: false,
    mimeTypes: [],
    extensions: [],
    formatsLabel: "",
    maxFileSize: 0,
    name: { fr: "Convertisseur de casse", en: "Case converter" },
    short: {
      fr: "Passez un texte en majuscules, minuscules ou en capitales initiales.",
      en: "Switch text to upper case, lower case or title case.",
    },
    h1: { fr: "Changer la casse d'un texte", en: "Change the case of a text" },
    subtitle: {
      fr: "Corrigez un texte tapé tout en majuscules en un clic.",
      en: "Fix a text typed in all caps in one click.",
    },
    seoTitle: {
      fr: "Convertisseur majuscules minuscules — Tools.cm",
      en: "Upper and lower case converter — Tools.cm",
    },
    seoDescription: {
      fr: "Convertissez gratuitement un texte en majuscules, minuscules ou capitales initiales.",
      en: "Convert a text to upper case, lower case or title case for free.",
    },
    keywords: [
      "majuscule minuscule",
      "convertir casse",
      "tout en majuscule",
      "uppercase lowercase",
      "title case",
    ],
    faq: [
      {
        q: {
          fr: "Les accents sont-ils gérés ?",
          en: "Are accents handled?",
        },
        a: {
          fr: "Oui. La conversion suit les règles du français, donc é devient É et à devient À, ce que beaucoup d'outils négligent.",
          en: "Yes. The conversion follows French rules, so é becomes É and à becomes À, which many tools get wrong.",
        },
      },
    ],
    about: [
      {
        fr: "Un nom saisi tout en majuscules dans un formulaire, un titre à normaliser, un message reçu en capitales : la conversion évite de tout retaper.",
        en: "A name entered in all caps on a form, a heading to normalise, a message received in capitals: converting saves retyping everything.",
      },
    ],
  },
];

export const UTILITY_MAX_UPLOAD = 20 * MB;
