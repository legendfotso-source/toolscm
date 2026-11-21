import type { ToolDefinition } from "@/types/tool";

/**
 * Tools added after the competitor review (November 2026).
 *
 * Sign, number, watermark and scan are what iLovePDF, Smallpdf and Adobe
 * offer and we lacked. « Dossier prêt » is ours alone: several documents of
 * any type, one PDF, guaranteed under the size a concours or embassy portal
 * accepts. Everything still runs in the browser: the files never leave.
 */
const MB = 1024 * 1024;
const PDF_MIME = ["application/pdf"];
const PDF_EXT = ["pdf"];
const PHOTO_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const PHOTO_EXT = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

export const pdfPlusTools: ToolDefinition[] = [
  {
    id: "dossier-pret",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "folder",
    popular: true,
    multiple: true,
    mimeTypes: [...PDF_MIME, ...PHOTO_MIME],
    extensions: [...PDF_EXT, ...PHOTO_EXT],
    formatsLabel: "PDF, JPG, PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "Dossier prêt (1 PDF sous X Mo)", en: "Ready-to-send file (1 PDF under X MB)" },
    short: {
      fr: "CNI, acte de naissance, diplôme… photos et PDF mélangés → un seul PDF sous la taille exigée.",
      en: "ID, birth certificate, diploma… photos and PDFs mixed → one PDF under the size required.",
    },
    h1: { fr: "Préparer un dossier de candidature en un seul PDF", en: "Turn an application into one PDF under the size limit" },
    subtitle: {
      fr: "Ajoutez toutes vos pièces, rangez-les, choisissez la limite (500 Ko, 1, 2 ou 5 Mo). Vous recevez un seul PDF qui passe.",
      en: "Add every document, put them in order, choose the limit (500 KB, 1, 2 or 5 MB). You get one PDF that is accepted.",
    },
    seoTitle: { fr: "Dossier de concours en un PDF de moins de 2 Mo — Tools.cm", en: "Application file as one PDF under 2 MB — Tools.cm" },
    seoDescription: {
      fr: "Assemblez photos et PDF (CNI, acte de naissance, diplômes) en un seul PDF garanti sous 500 Ko, 1 Mo, 2 Mo ou 5 Mo. Gratuit, sur votre téléphone, sans envoi.",
      en: "Combine photos and PDFs (ID, birth certificate, diplomas) into one PDF guaranteed under 500 KB, 1 MB, 2 MB or 5 MB. Free, on your phone, nothing uploaded.",
    },
    keywords: [
      "dossier concours pdf", "pdf moins de 2 mo", "pdf 1 mo", "reduire dossier pdf", "dossier candidature",
      "campus france pdf", "dossier visa pdf", "fusionner et compresser", "application pdf under 2mb", "combine and compress pdf",
    ],
    faq: [
      {
        q: { fr: "Et si mes pièces sont trop nombreuses pour la limite ?", en: "What if there are too many documents for the limit?" },
        a: {
          fr: "Nous essayons d'abord sans aucune perte, puis nous réduisons pas à pas. Si même le réglage le plus fort dépasse, nous vous le disons clairement au lieu de livrer un fichier refusé.",
          en: "We first try with no loss at all, then reduce step by step. If even the strongest setting is too heavy, we say so plainly instead of handing you a file that would be rejected.",
        },
      },
      {
        q: { fr: "Mes documents sont-ils envoyés quelque part ?", en: "Are my documents sent anywhere?" },
        a: {
          fr: "Non. Tout se fait dans votre téléphone ou votre ordinateur. Vos pièces d'identité ne passent par aucun serveur.",
          en: "No. Everything happens on your phone or computer. Your ID documents never pass through a server.",
        },
      },
    ],
    about: [
      {
        fr: "Les portails de concours, d'ambassades et de bourses demandent souvent « un seul fichier PDF de 2 Mo maximum ». D'habitude il faut fusionner, puis compresser, puis recommencer. Ici, une seule étape.",
        en: "Exam, embassy and scholarship portals often ask for “a single PDF, 2 MB maximum”. Usually that means merging, then compressing, then starting again. Here it is one step.",
      },
    ],
  },
  {
    id: "sign-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "sign",
    popular: true,
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Signer un PDF", en: "Sign PDF" },
    short: {
      fr: "Signez au doigt ou avec la photo de votre signature, et paraphez chaque page.",
      en: "Sign with your finger or a photo of your signature, and initial every page.",
    },
    h1: { fr: "Signer un PDF depuis son téléphone", en: "Sign a PDF from your phone" },
    subtitle: {
      fr: "Dessinez votre signature, ou photographiez-la sur papier : le fond blanc disparaît. Ajoutez la date et les paraphes.",
      en: "Draw your signature, or photograph it on paper: the white background disappears. Add the date and initials.",
    },
    seoTitle: { fr: "Signer un PDF gratuitement, sans compte — Tools.cm", en: "Sign a PDF for free, no account — Tools.cm" },
    seoDescription: {
      fr: "Ajoutez votre signature manuscrite à un PDF, avec la date et un paraphe sur chaque page. Gratuit, sans inscription, sans envoi du document.",
      en: "Add your handwritten signature to a PDF, with the date and initials on every page. Free, no sign-up, the document is never uploaded.",
    },
    keywords: ["signer pdf", "signature pdf", "parapher pdf", "signer contrat", "signature electronique", "sign pdf", "esign", "initial pdf"],
    faq: [
      {
        q: { fr: "Est-ce une signature électronique qualifiée ?", en: "Is this a qualified electronic signature?" },
        a: {
          fr: "Non : c'est l'image de votre signature manuscrite posée sur le document, comme une signature scannée. Elle convient aux contrats courants, attestations et formulaires.",
          en: "No: it is an image of your handwritten signature placed on the document, like a scanned signature. It suits everyday contracts, attestations and forms.",
        },
      },
    ],
    about: [
      {
        fr: "Imprimer, signer, scanner : trois appareils pour une signature. Ici le document reste sur votre téléphone du début à la fin.",
        en: "Print, sign, scan: three machines for one signature. Here the document stays on your phone from start to finish.",
      },
    ],
  },
  {
    id: "scan-to-pdf",
    categories: ["pdf", "image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "scan",
    popular: true,
    multiple: true,
    mimeTypes: PHOTO_MIME,
    extensions: PHOTO_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 25 * MB,
    name: { fr: "Scanner un document", en: "Scan to PDF" },
    short: {
      fr: "Photos d'un document → un PDF propre, papier bien blanc, comme un vrai scanner.",
      en: "Photos of a document → a clean PDF with white paper, like a real scanner.",
    },
    h1: { fr: "Scanner un document avec son téléphone", en: "Scan a document with your phone" },
    subtitle: {
      fr: "Prenez vos pages en photo. Nous blanchissons le papier, renforçons le texte et assemblons le tout en A4.",
      en: "Photograph your pages. We whiten the paper, sharpen the text and assemble everything as A4.",
    },
    seoTitle: { fr: "Scanner un document en PDF avec son téléphone — Tools.cm", en: "Scan a document to PDF with your phone — Tools.cm" },
    seoDescription: {
      fr: "Transformez les photos de vos documents en un PDF scanné net, en noir et blanc ou en couleur. Gratuit, sans application à installer.",
      en: "Turn photos of your documents into a crisp scanned PDF, black and white or colour. Free, no app to install.",
    },
    keywords: ["scanner document", "scanner telephone", "photo en pdf", "scan pdf", "camscanner", "scan to pdf", "document scanner"],
    faq: [
      {
        q: { fr: "Faut-il installer une application ?", en: "Do I need to install an app?" },
        a: {
          fr: "Non. Le site utilise l'appareil photo de votre téléphone et tout le traitement se fait dans le navigateur.",
          en: "No. The site uses your phone's camera and all processing happens in the browser.",
        },
      },
    ],
    about: [
      {
        fr: "Une photo de feuille est grise, jaunâtre et pleine d'ombres. Nous étirons les couleurs pour que le papier redevienne blanc et que l'encre ressorte, puis chaque photo devient une page A4.",
        en: "A photo of a sheet is grey, yellowish and shadowed. We stretch the colours so the paper turns white and the ink stands out, then each photo becomes an A4 page.",
      },
    ],
  },
  {
    id: "page-numbers-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "numbers",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Numéroter les pages", en: "Add page numbers" },
    short: { fr: "Ajoutez « 3 », « 3 / 12 » ou « Page 3 / 12 » en bas de chaque page.", en: "Add “3”, “3 / 12” or “Page 3 / 12” to every page." },
    h1: { fr: "Ajouter des numéros de page à un PDF", en: "Add page numbers to a PDF" },
    subtitle: {
      fr: "Choisissez l'emplacement, le format et le premier numéro. La page de garde peut rester sans numéro.",
      en: "Choose the position, format and first number. The cover page can stay unnumbered.",
    },
    seoTitle: { fr: "Numéroter les pages d'un PDF gratuitement — Tools.cm", en: "Add page numbers to a PDF for free — Tools.cm" },
    seoDescription: {
      fr: "Numérotez les pages d'un mémoire, d'un rapport ou d'un dossier PDF en quelques secondes, dans votre navigateur.",
      en: "Number the pages of a thesis, report or PDF file in seconds, in your browser.",
    },
    keywords: ["numeroter pdf", "numero de page pdf", "pagination pdf", "memoire pdf", "page numbers pdf", "number pdf pages"],
    faq: [
      {
        q: { fr: "Puis-je commencer à un autre numéro que 1 ?", en: "Can I start from a number other than 1?" },
        a: { fr: "Oui, choisissez le premier numéro : utile quand votre PDF est la suite d'un autre document.", en: "Yes, pick the first number: useful when your PDF continues another document." },
      },
    ],
    about: [
      {
        fr: "Un mémoire ou un rapport sans numéros de page est difficile à relire et à citer. Les numéros sont écrits dans le fichier et apparaissent partout, y compris à l'impression.",
        en: "A thesis or report without page numbers is hard to review and cite. The numbers are written into the file and show everywhere, including in print.",
      },
    ],
  },
  {
    id: "watermark-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "watermark",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Filigrane sur un PDF", en: "Watermark PDF" },
    short: {
      fr: "Protégez la copie de votre CNI ou de vos diplômes : « COPIE — usage exclusif … ».",
      en: "Protect copies of your ID or diplomas: “COPY — for … only”.",
    },
    h1: { fr: "Ajouter un filigrane à un PDF", en: "Add a watermark to a PDF" },
    subtitle: {
      fr: "En diagonale, répété sur toute la page ou discret en pied de page, avec l'opacité et la couleur de votre choix.",
      en: "Diagonal, tiled across the page or discreet in the footer, with the opacity and colour you choose.",
    },
    seoTitle: { fr: "Ajouter un filigrane à un PDF gratuitement — Tools.cm", en: "Watermark a PDF for free — Tools.cm" },
    seoDescription: {
      fr: "Ajoutez un filigrane texte à un PDF pour éviter la réutilisation de vos documents d'identité. Gratuit, dans votre navigateur.",
      en: "Add a text watermark to a PDF so your identity documents cannot be reused. Free, in your browser.",
    },
    keywords: ["filigrane pdf", "watermark pdf", "copie cni", "proteger document", "tampon pdf", "copie conforme"],
    faq: [
      {
        q: { fr: "Pourquoi mettre un filigrane sur ma CNI ?", en: "Why watermark my ID card?" },
        a: {
          fr: "Une copie marquée « usage exclusif pour [organisme] » ne peut pas être réutilisée ailleurs sans que cela se voie. C'est une bonne habitude avant d'envoyer une pièce d'identité.",
          en: "A copy marked “for [organisation] only” cannot be reused elsewhere without it showing. It is a good habit before sending any ID document.",
        },
      },
    ],
    about: [
      {
        fr: "Le filigrane accepte n'importe quel texte, accents et caractères spéciaux compris, et il est fondu dans chaque page du fichier.",
        en: "The watermark accepts any text, accents and special characters included, and is merged into every page of the file.",
      },
    ],
  },
];
