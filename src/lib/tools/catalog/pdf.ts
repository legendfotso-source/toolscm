import type { ToolDefinition } from "@/types/tool";

const MB = 1024 * 1024;

const PDF_MIME = ["application/pdf"];
const PDF_EXT = ["pdf"];

export const pdfTools: ToolDefinition[] = [
  {
    id: "compress-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "compress",
    popular: true,
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Compresser un PDF", en: "Compress PDF" },
    short: {
      fr: "Réduisez le poids d'un PDF pour l'envoyer par email ou le déposer en ligne.",
      en: "Shrink a PDF so it fits an email or an online application form.",
    },
    h1: { fr: "Compresser un PDF gratuitement", en: "Compress a PDF for free" },
    subtitle: {
      fr: "Réduisez la taille de votre PDF directement dans votre navigateur.",
      en: "Reduce the size of your PDF directly in your browser.",
    },
    seoTitle: {
      fr: "Compresser un PDF gratuitement — Tools.cm",
      en: "Compress a PDF for free — Tools.cm",
    },
    seoDescription: {
      fr: "Réduisez gratuitement la taille de vos fichiers PDF directement depuis votre navigateur. Rapide, simple et privé.",
      en: "Reduce the size of your PDF files for free, directly in your browser. Fast, simple and private.",
    },
    keywords: [
      "compresser pdf",
      "reduire taille pdf",
      "pdf trop lourd",
      "pdf 1 mo",
      "compress pdf",
      "reduce pdf size",
      "shrink pdf",
      "concours",
    ],
    faq: [
      {
        q: {
          fr: "Jusqu'où un PDF peut-il être réduit ?",
          en: "How much can a PDF be reduced?",
        },
        a: {
          fr: "Cela dépend entièrement du fichier. Un PDF issu d'un scan ou de photos se réduit souvent de 60 à 90 %. Un PDF de texte déjà optimisé — un document exporté depuis Word, par exemple — ne gagnera parfois que quelques pourcents. Nous affichons toujours la taille réelle obtenue, et nous vous le disons franchement si le fichier ne peut pas être réduit.",
          en: "It depends entirely on the file. A PDF made of scans or photos often drops by 60–90%. A text PDF that is already optimised — one exported from Word, for example — may only gain a few percent. We always show the real resulting size, and we tell you plainly if the file cannot be reduced.",
        },
      },
      {
        q: {
          fr: "Pourquoi le mode « Compression forte » rend-il le texte non sélectionnable ?",
          en: "Why does \"Strong compression\" make the text unselectable?",
        },
        a: {
          fr: "Ce mode transforme chaque page en image avant de reconstruire le PDF. C'est ce qui permet les très fortes réductions sur les documents scannés, mais le texte devient une image : il n'est plus sélectionnable ni recherchable. Si votre document doit rester consultable, choisissez « Optimisation sans perte ».",
          en: "That mode turns each page into an image before rebuilding the PDF. It is what makes very large reductions possible on scanned documents, but the text becomes a picture: it is no longer selectable or searchable. If your document must stay searchable, choose \"Lossless optimisation\".",
        },
      },
      {
        q: {
          fr: "Pouvez-vous garantir un fichier de moins de 1 Mo ?",
          en: "Can you guarantee a file under 1 MB?",
        },
        a: {
          fr: "Non, et personne ne le peut honnêtement pour tous les fichiers. Un document de 60 pages en couleur ne descendra pas sous 1 Mo sans devenir illisible. Réduisez la qualité par paliers et regardez la taille obtenue à chaque essai : elle est calculée sur le fichier réellement produit.",
          en: "No, and nobody honestly can for every file. A 60-page colour document will not go under 1 MB without becoming unreadable. Step the quality down and watch the resulting size on each attempt: it is measured on the file actually produced.",
        },
      },
      {
        q: {
          fr: "Mon PDF est-il envoyé sur Internet ?",
          en: "Is my PDF sent over the internet?",
        },
        a: {
          fr: "Non. La compression se fait entièrement dans votre navigateur, sur votre appareil. Le fichier n'est jamais téléversé vers nos serveurs.",
          en: "No. Compression happens entirely in your browser, on your device. The file is never uploaded to our servers.",
        },
      },
    ],
    about: [
      {
        fr: "Un dossier de concours, une candidature en ligne ou un formulaire administratif impose souvent une taille maximale — 1 Mo, 2 Mo, parfois 500 Ko. Un document scanné avec un téléphone dépasse presque toujours cette limite, car chaque page est une photo en pleine résolution.",
        en: "Exam applications, online job forms and administrative portals often impose a size cap — 1 MB, 2 MB, sometimes 500 KB. A document scanned with a phone almost always exceeds it, because every page is a full-resolution photo.",
      },
      {
        fr: "Cet outil propose deux approches. L'optimisation sans perte reconstruit la structure interne du PDF et supprime les données inutiles : le texte reste sélectionnable, mais le gain est modéré. La compression par rasterisation redessine chaque page en image à la résolution que vous choisissez : le gain est important, au prix de la sélection du texte.",
        en: "This tool offers two approaches. Lossless optimisation rebuilds the PDF's internal structure and strips unused data: the text stays selectable, but the gain is moderate. Raster compression redraws every page as an image at the resolution you pick: the gain is large, at the cost of selectable text.",
      },
    ],
  },
  {
    id: "merge-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "merge",
    popular: true,
    multiple: true,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Fusionner des PDF", en: "Merge PDF" },
    short: {
      fr: "Réunissez plusieurs PDF en un seul document, dans l'ordre que vous choisissez.",
      en: "Combine several PDFs into one document, in the order you choose.",
    },
    h1: { fr: "Fusionner plusieurs PDF en un seul", en: "Merge several PDFs into one" },
    subtitle: {
      fr: "Assemblez vos documents en un seul fichier, sans quitter votre navigateur.",
      en: "Assemble your documents into a single file, without leaving your browser.",
    },
    seoTitle: {
      fr: "Fusionner des PDF gratuitement — Tools.cm",
      en: "Merge PDF files for free — Tools.cm",
    },
    seoDescription: {
      fr: "Combinez plusieurs fichiers PDF en un seul document, gratuitement et directement dans votre navigateur.",
      en: "Combine several PDF files into one document, free and directly in your browser.",
    },
    keywords: [
      "fusionner pdf",
      "combiner pdf",
      "assembler pdf",
      "joindre pdf",
      "merge pdf",
      "combine pdf",
      "dossier",
    ],
    faq: [
      {
        q: { fr: "Combien de fichiers puis-je fusionner ?", en: "How many files can I merge?" },
        a: {
          fr: "Il n'y a pas de limite fixe sur le nombre de fichiers, mais l'ensemble doit tenir dans la mémoire de votre appareil. Sur un téléphone d'entrée de gamme, restez raisonnablement sous 100 Mo au total. Si la mémoire manque, nous vous le disons au lieu de laisser la page se figer.",
          en: "There is no fixed limit on the number of files, but the whole set has to fit in your device's memory. On an entry-level phone, stay reasonably under 100 MB in total. If memory runs out we tell you, instead of letting the page freeze.",
        },
      },
      {
        q: { fr: "Puis-je changer l'ordre des documents ?", en: "Can I change the order?" },
        a: {
          fr: "Oui. Après avoir ajouté vos fichiers, utilisez les flèches pour les remonter ou les descendre. Le PDF final suit exactement l'ordre affiché.",
          en: "Yes. Once your files are added, use the arrows to move them up or down. The final PDF follows exactly the order shown.",
        },
      },
      {
        q: { fr: "La qualité est-elle modifiée ?", en: "Is the quality changed?" },
        a: {
          fr: "Non. Les pages sont copiées telles quelles dans le nouveau document. Aucune recompression n'est appliquée.",
          en: "No. Pages are copied as they are into the new document. No recompression is applied.",
        },
      },
    ],
    about: [
      {
        fr: "Un dossier administratif demande souvent un seul fichier : acte de naissance, diplôme, CV et pièce d'identité réunis. Les fusionner évite les envois multiples et les pièces jointes oubliées.",
        en: "An application file often has to be a single document: birth certificate, diploma, CV and ID all together. Merging them avoids multiple uploads and forgotten attachments.",
      },
      {
        fr: "Les pages sont copiées sans être recompressées, ce qui préserve la qualité d'origine. Si le résultat est trop lourd pour le site où vous devez le déposer, passez-le ensuite par l'outil de compression.",
        en: "Pages are copied without recompression, which preserves the original quality. If the result is too heavy for the site you have to upload it to, run it through the compression tool afterwards.",
      },
    ],
  },
  {
    id: "split-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "split",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Diviser un PDF", en: "Split PDF" },
    short: {
      fr: "Extrayez une plage de pages ou séparez un document page par page.",
      en: "Extract a page range or split a document page by page.",
    },
    h1: { fr: "Diviser un PDF en plusieurs fichiers", en: "Split a PDF into several files" },
    subtitle: {
      fr: "Extrayez les pages dont vous avez besoin, directement sur votre appareil.",
      en: "Pull out just the pages you need, directly on your device.",
    },
    seoTitle: {
      fr: "Diviser un PDF gratuitement — Tools.cm",
      en: "Split a PDF for free — Tools.cm",
    },
    seoDescription: {
      fr: "Séparez un PDF en plusieurs fichiers ou extrayez une plage de pages, gratuitement et dans votre navigateur.",
      en: "Split a PDF into several files or extract a page range, free and in your browser.",
    },
    keywords: [
      "diviser pdf",
      "separer pdf",
      "extraire pages pdf",
      "couper pdf",
      "split pdf",
      "extract pages",
    ],
    faq: [
      {
        q: { fr: "Comment écrire une plage de pages ?", en: "How do I write a page range?" },
        a: {
          fr: "Séparez les valeurs par des virgules et utilisez un tiret pour une suite : 1-3, 5, 8-10. Les pages sont numérotées à partir de 1.",
          en: "Separate values with commas and use a dash for a run: 1-3, 5, 8-10. Pages are numbered from 1.",
        },
      },
      {
        q: { fr: "Puis-je obtenir un fichier par page ?", en: "Can I get one file per page?" },
        a: {
          fr: "Oui, choisissez le mode « Une page par fichier ». Chaque page devient un PDF séparé, téléchargeable individuellement.",
          en: "Yes, choose the \"One file per page\" mode. Each page becomes its own PDF, downloadable individually.",
        },
      },
    ],
    about: [
      {
        fr: "Il arrive qu'on ne doive envoyer qu'une partie d'un document : les deux pages d'un relevé, une seule attestation dans un dossier de vingt pages. Extraire évite de transmettre des informations qui ne regardent personne d'autre.",
        en: "Sometimes only part of a document should be sent: two pages of a statement, one certificate inside a twenty-page file. Extracting avoids handing over information nobody else needs to see.",
      },
    ],
  },
  {
    id: "jpg-to-pdf",
    categories: ["pdf", "image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "imageToPdf",
    popular: true,
    multiple: true,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    extensions: ["jpg", "jpeg", "png", "webp"],
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "JPG en PDF", en: "JPG to PDF" },
    short: {
      fr: "Transformez vos photos en un document PDF propre, prêt à envoyer.",
      en: "Turn your photos into a clean PDF document, ready to send.",
    },
    h1: { fr: "Convertir des images JPG en PDF", en: "Convert JPG images to PDF" },
    subtitle: {
      fr: "Réunissez vos photos en un seul PDF, avec le format de page de votre choix.",
      en: "Combine your photos into a single PDF, with the page format you choose.",
    },
    seoTitle: {
      fr: "Convertir JPG en PDF gratuitement — Tools.cm",
      en: "Convert JPG to PDF for free — Tools.cm",
    },
    seoDescription: {
      fr: "Transformez gratuitement vos images JPG ou PNG en un fichier PDF, directement dans votre navigateur.",
      en: "Turn your JPG or PNG images into a PDF file for free, directly in your browser.",
    },
    keywords: [
      "jpg en pdf",
      "photo en pdf",
      "image en pdf",
      "png en pdf",
      "scanner avec telephone",
      "jpg to pdf",
      "image to pdf",
      "picture to pdf",
    ],
    faq: [
      {
        q: { fr: "Puis-je choisir l'ordre des photos ?", en: "Can I choose the photo order?" },
        a: {
          fr: "Oui. Chaque image apparaît dans la liste avec des flèches pour la déplacer. L'ordre affiché est l'ordre des pages du PDF.",
          en: "Yes. Each image appears in the list with arrows to move it. The order shown is the page order of the PDF.",
        },
      },
      {
        q: {
          fr: "Pourquoi mon PDF est-il plus lourd que mes photos ?",
          en: "Why is my PDF heavier than my photos?",
        },
        a: {
          fr: "Les images PNG sont stockées sans perte dans le PDF et peuvent occuper beaucoup de place. Si le poids compte, convertissez d'abord vos PNG en JPG, ou compressez le PDF obtenu.",
          en: "PNG images are stored losslessly inside the PDF and can take a lot of room. If size matters, convert your PNGs to JPG first, or compress the resulting PDF.",
        },
      },
      {
        q: { fr: "Quel format de page choisir ?", en: "Which page size should I choose?" },
        a: {
          fr: "A4 pour un dossier administratif au Cameroun et en Europe, Letter pour l'Amérique du Nord. « Ajusté à l'image » crée une page exactement à la taille de chaque photo, sans marge ni bande blanche.",
          en: "A4 for administrative files in Cameroon and Europe, Letter for North America. \"Fit to image\" creates a page exactly the size of each photo, with no margin or white band.",
        },
      },
    ],
    about: [
      {
        fr: "Photographier un document avec son téléphone est devenu le moyen le plus courant de le numériser. Mais la plupart des plateformes n'acceptent qu'un PDF, pas une série de JPG.",
        en: "Photographing a document with a phone has become the most common way to digitise it. But most platforms only accept a PDF, not a series of JPGs.",
      },
      {
        fr: "Choisissez le format de page, l'orientation et la marge, puis générez un PDF unique. Vos photos ne sont pas téléversées : la conversion se fait dans le navigateur.",
        en: "Choose the page size, orientation and margin, then generate a single PDF. Your photos are not uploaded: the conversion happens in the browser.",
      },
    ],
  },
  {
    id: "pdf-to-jpg",
    categories: ["pdf", "image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "pdfToImage",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "PDF en JPG", en: "PDF to JPG" },
    short: {
      fr: "Transformez chaque page d'un PDF en image, prête à partager sur WhatsApp.",
      en: "Turn each page of a PDF into an image, ready to share on WhatsApp.",
    },
    h1: { fr: "Convertir un PDF en images JPG", en: "Convert a PDF to JPG images" },
    subtitle: {
      fr: "Générez une image par page, à la résolution que vous choisissez.",
      en: "Generate one image per page, at the resolution you choose.",
    },
    seoTitle: {
      fr: "Convertir un PDF en JPG gratuitement — Tools.cm",
      en: "Convert PDF to JPG for free — Tools.cm",
    },
    seoDescription: {
      fr: "Convertissez gratuitement les pages d'un PDF en images JPG ou PNG, directement dans votre navigateur.",
      en: "Convert PDF pages to JPG or PNG images for free, directly in your browser.",
    },
    keywords: [
      "pdf en jpg",
      "pdf en image",
      "pdf en png",
      "extraire images pdf",
      "pdf to jpg",
      "pdf to image",
      "whatsapp",
    ],
    faq: [
      {
        q: { fr: "Quelle résolution choisir ?", en: "Which resolution should I choose?" },
        a: {
          fr: "150 DPI suffit pour lire à l'écran ou partager sur WhatsApp. 300 DPI donne une image nette à l'impression, mais des fichiers nettement plus lourds. Au-delà, sur téléphone, la mémoire devient un problème.",
          en: "150 DPI is enough to read on screen or share on WhatsApp. 300 DPI gives a sharp printed image but noticeably heavier files. Beyond that, memory becomes a problem on phones.",
        },
      },
      {
        q: { fr: "Puis-je ne convertir que certaines pages ?", en: "Can I convert only some pages?" },
        a: {
          fr: "Oui, indiquez une plage comme 1-3, 7. Laissez le champ vide pour convertir tout le document.",
          en: "Yes, enter a range like 1-3, 7. Leave the field empty to convert the whole document.",
        },
      },
    ],
    about: [
      {
        fr: "Envoyer une page de document sur WhatsApp est bien plus simple en image qu'en PDF : l'aperçu s'affiche directement dans la conversation, sans que le destinataire ait à ouvrir un lecteur.",
        en: "Sending one page of a document over WhatsApp is far simpler as an image than as a PDF: the preview shows straight in the conversation, with no reader to open.",
      },
      {
        fr: "Chaque page est redessinée dans votre navigateur puis enregistrée en JPG ou en PNG. Le PDF d'origine n'est pas modifié.",
        en: "Each page is redrawn in your browser and then saved as JPG or PNG. The original PDF is left untouched.",
      },
    ],
  },
  {
    id: "rotate-pdf",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "rotate",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Pivoter un PDF", en: "Rotate PDF" },
    short: {
      fr: "Redressez un document scanné de travers, en une ou plusieurs pages.",
      en: "Straighten a sideways scan, one page or all of them.",
    },
    h1: { fr: "Faire pivoter les pages d'un PDF", en: "Rotate the pages of a PDF" },
    subtitle: {
      fr: "Tournez tout le document ou seulement certaines pages, puis enregistrez.",
      en: "Turn the whole document or only certain pages, then save.",
    },
    seoTitle: {
      fr: "Pivoter un PDF gratuitement — Tools.cm",
      en: "Rotate a PDF for free — Tools.cm",
    },
    seoDescription: {
      fr: "Faites pivoter les pages d'un PDF de 90, 180 ou 270 degrés, gratuitement et dans votre navigateur.",
      en: "Rotate PDF pages by 90, 180 or 270 degrees, free and in your browser.",
    },
    keywords: [
      "pivoter pdf",
      "tourner pdf",
      "redresser pdf",
      "pdf a l envers",
      "rotate pdf",
      "turn pdf",
    ],
    faq: [
      {
        q: {
          fr: "La rotation est-elle définitive ?",
          en: "Is the rotation permanent?",
        },
        a: {
          fr: "Oui, elle est enregistrée dans le fichier produit. Tous les lecteurs afficheront le document dans le bon sens, y compris à l'impression.",
          en: "Yes, it is written into the file we produce. Every reader will show the document the right way up, including when printing.",
        },
      },
    ],
    about: [
      {
        fr: "Un document scanné dans le mauvais sens est pénible à lire et donne une mauvaise impression dans un dossier. La rotation corrige cela sans toucher au contenu des pages.",
        en: "A document scanned the wrong way round is tiring to read and looks careless in an application. Rotating fixes it without touching the page content.",
      },
    ],
  },
  {
    id: "delete-pdf-pages",
    categories: ["pdf"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "delete",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Supprimer des pages", en: "Delete PDF pages" },
    short: {
      fr: "Retirez les pages blanches ou inutiles avant d'envoyer un document.",
      en: "Strip blank or unwanted pages before sending a document.",
    },
    h1: { fr: "Supprimer des pages d'un PDF", en: "Delete pages from a PDF" },
    subtitle: {
      fr: "Indiquez les pages à retirer, nous générons le document allégé.",
      en: "Tell us which pages to remove and we generate the trimmed document.",
    },
    seoTitle: {
      fr: "Supprimer des pages d'un PDF — Tools.cm",
      en: "Delete pages from a PDF — Tools.cm",
    },
    seoDescription: {
      fr: "Supprimez gratuitement des pages d'un fichier PDF, directement depuis votre navigateur.",
      en: "Delete pages from a PDF file for free, directly from your browser.",
    },
    keywords: [
      "supprimer page pdf",
      "enlever page pdf",
      "retirer page pdf",
      "delete pdf page",
      "remove page pdf",
    ],
    faq: [
      {
        q: {
          fr: "Mon fichier d'origine est-il modifié ?",
          en: "Is my original file modified?",
        },
        a: {
          fr: "Non. Un nouveau fichier est créé et proposé au téléchargement. Le PDF que vous avez sélectionné reste intact sur votre appareil.",
          en: "No. A new file is created and offered for download. The PDF you selected stays untouched on your device.",
        },
      },
    ],
    about: [
      {
        fr: "Les scanners ajoutent souvent une page blanche à la fin, et un document téléchargé contient parfois une page de garde inutile. Les retirer allège le fichier et rend le dossier plus lisible.",
        en: "Scanners often add a blank page at the end, and a downloaded document sometimes carries a pointless cover page. Removing them lightens the file and makes the application easier to read.",
      },
    ],
  },
  {
    id: "extract-text-pdf",
    categories: ["pdf", "utility"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "text",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Extraire le texte d'un PDF", en: "Extract text from PDF" },
    short: {
      fr: "Récupérez le texte d'un PDF pour le copier ou le réutiliser ailleurs.",
      en: "Pull the text out of a PDF to copy it or reuse it elsewhere.",
    },
    h1: { fr: "Extraire le texte d'un fichier PDF", en: "Extract the text from a PDF file" },
    subtitle: {
      fr: "Copiez le texte du document ou téléchargez-le en fichier .txt.",
      en: "Copy the document text or download it as a .txt file.",
    },
    seoTitle: {
      fr: "Extraire le texte d'un PDF — Tools.cm",
      en: "Extract text from a PDF — Tools.cm",
    },
    seoDescription: {
      fr: "Extrayez gratuitement le texte d'un fichier PDF directement dans votre navigateur, sans envoyer le document.",
      en: "Extract the text from a PDF file for free directly in your browser, without sending the document.",
    },
    keywords: [
      "extraire texte pdf",
      "copier texte pdf",
      "pdf en texte",
      "extract text pdf",
      "pdf to text",
    ],
    faq: [
      {
        q: {
          fr: "Cela fonctionne-t-il sur un document scanné ?",
          en: "Does this work on a scanned document?",
        },
        a: {
          fr: "Non. Un scan est une image : il ne contient pas de texte à extraire, seulement des pixels. Il faudrait une reconnaissance optique de caractères (OCR), que nous ne proposons pas encore. Si nous ne trouvons aucun texte, nous vous le disons clairement plutôt que de renvoyer un fichier vide.",
          en: "No. A scan is an image: it holds no text to extract, only pixels. That would need optical character recognition (OCR), which we do not offer yet. If we find no text, we say so plainly rather than handing you an empty file.",
        },
      },
      {
        q: {
          fr: "La mise en page est-elle conservée ?",
          en: "Is the layout preserved?",
        },
        a: {
          fr: "Partiellement. Nous restituons l'ordre de lecture et les sauts de ligne, mais pas les colonnes, les tableaux ni la typographie. Pour un rendu fidèle, il faut une conversion PDF vers Word, encore en préparation.",
          en: "Partly. We keep the reading order and line breaks, but not columns, tables or typography. A faithful rendering needs PDF-to-Word conversion, which is still in preparation.",
        },
      },
    ],
    about: [
      {
        fr: "Recopier à la main un paragraphe depuis un PDF fait perdre du temps et introduit des fautes. L'extraction récupère le texte tel qu'il est encodé dans le document.",
        en: "Retyping a paragraph out of a PDF wastes time and introduces mistakes. Extraction recovers the text exactly as it is encoded in the document.",
      },
      {
        fr: "L'analyse se fait dans votre navigateur : le contenu du document ne transite par aucun serveur, ce qui compte pour un contrat ou un relevé.",
        en: "The parsing happens in your browser: the document's contents pass through no server, which matters for a contract or a statement.",
      },
    ],
  },

  /* ---------------------------------------------------------------
     Listed so people can find them and see where we stand.
     Not usable. Never faked.
  --------------------------------------------------------------- */
  {
    id: "pdf-to-word",
    categories: ["pdf"],
    status: "COMING_SOON",
    processingMode: "client",
    icon: "word",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "PDF en Word", en: "PDF to Word" },
    short: {
      fr: "Convertir un PDF en document Word modifiable.",
      en: "Convert a PDF into an editable Word document.",
    },
    h1: { fr: "Convertir un PDF en Word", en: "Convert a PDF to Word" },
    subtitle: {
      fr: "Cet outil n'est pas encore disponible.",
      en: "This tool is not available yet.",
    },
    seoTitle: { fr: "PDF en Word — Tools.cm", en: "PDF to Word — Tools.cm" },
    seoDescription: {
      fr: "La conversion PDF vers Word est en préparation sur Tools.cm.",
      en: "PDF to Word conversion is in preparation on Tools.cm.",
    },
    keywords: ["pdf en word", "pdf to word", "pdf en doc", "pdf docx"],
    faq: [
      {
        q: { fr: "Pourquoi n'est-ce pas encore disponible ?", en: "Why is it not available yet?" },
        a: {
          fr: "Une conversion PDF vers Word fidèle demande de reconstruire la mise en page, les colonnes et les tableaux. Les solutions qui tournent entièrement dans le navigateur donnent aujourd'hui des résultats trop irréguliers pour être publiées. Nous préférons ne rien proposer plutôt que de rendre un fichier inutilisable.",
          en: "A faithful PDF-to-Word conversion means rebuilding layout, columns and tables. The approaches that run entirely in the browser are still too unreliable to publish. We would rather offer nothing than hand back an unusable file.",
        },
      },
    ],
    about: [
      {
        fr: "En attendant, l'outil d'extraction de texte récupère le contenu écrit d'un PDF, que vous pouvez coller dans Word et remettre en forme.",
        en: "In the meantime, the text extraction tool recovers a PDF's written content, which you can paste into Word and format yourself.",
      },
    ],
  },
  {
    id: "word-to-pdf",
    categories: ["pdf"],
    status: "COMING_SOON",
    processingMode: "client",
    icon: "word",
    multiple: false,
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    extensions: ["docx"],
    formatsLabel: "DOCX",
    maxFileSize: 50 * MB,
    name: { fr: "Word en PDF", en: "Word to PDF" },
    short: {
      fr: "Convertir un document Word en PDF.",
      en: "Convert a Word document into a PDF.",
    },
    h1: { fr: "Convertir un document Word en PDF", en: "Convert a Word document to PDF" },
    subtitle: {
      fr: "Cet outil n'est pas encore disponible.",
      en: "This tool is not available yet.",
    },
    seoTitle: { fr: "Word en PDF — Tools.cm", en: "Word to PDF — Tools.cm" },
    seoDescription: {
      fr: "La conversion Word vers PDF est en préparation sur Tools.cm.",
      en: "Word to PDF conversion is in preparation on Tools.cm.",
    },
    keywords: ["word en pdf", "docx en pdf", "word to pdf", "doc en pdf"],
    faq: [
      {
        q: { fr: "Que faire en attendant ?", en: "What can I do in the meantime?" },
        a: {
          fr: "Microsoft Word, Google Docs et LibreOffice exportent tous en PDF, gratuitement et fidèlement, y compris depuis un téléphone. C'est aujourd'hui le meilleur chemin.",
          en: "Microsoft Word, Google Docs and LibreOffice all export to PDF, free and faithfully, including from a phone. That is the best route today.",
        },
      },
    ],
    about: [
      {
        fr: "Reproduire fidèlement dans un navigateur la mise en page de Word — polices, sauts de page, tableaux — demande un moteur de rendu complet. Nous publierons cet outil quand le résultat sera réellement fidèle.",
        en: "Faithfully reproducing Word's layout in a browser — fonts, page breaks, tables — needs a full rendering engine. We will publish this tool when the result is genuinely faithful.",
      },
    ],
  },
  {
    id: "protect-pdf",
    categories: ["pdf"],
    status: "COMING_SOON",
    processingMode: "client",
    icon: "lock",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Protéger un PDF", en: "Protect PDF" },
    short: {
      fr: "Ajouter un mot de passe à un document PDF.",
      en: "Add a password to a PDF document.",
    },
    h1: { fr: "Protéger un PDF par mot de passe", en: "Password-protect a PDF" },
    subtitle: {
      fr: "Cet outil n'est pas encore disponible.",
      en: "This tool is not available yet.",
    },
    seoTitle: { fr: "Protéger un PDF — Tools.cm", en: "Protect a PDF — Tools.cm" },
    seoDescription: {
      fr: "La protection de PDF par mot de passe est en préparation sur Tools.cm.",
      en: "Password protection for PDFs is in preparation on Tools.cm.",
    },
    keywords: ["proteger pdf", "mot de passe pdf", "chiffrer pdf", "protect pdf", "encrypt pdf"],
    faq: [
      {
        q: {
          fr: "Pourquoi ne pas le proposer tout de suite ?",
          en: "Why not offer it right away?",
        },
        a: {
          fr: "Un chiffrement mal implémenté donne un faux sentiment de sécurité, ce qui est pire que pas de protection du tout. Nous ne publierons cet outil qu'avec un chiffrement conforme et vérifié.",
          en: "Badly implemented encryption gives a false sense of security, which is worse than none at all. We will only publish this tool with conformant, verified encryption.",
        },
      },
    ],
    about: [
      {
        fr: "Un PDF protégé sert surtout à limiter la lecture d'un document sensible envoyé par email. Tant que nous ne pouvons pas le faire correctement, nous préférons le dire.",
        en: "A protected PDF is mostly used to limit who can read a sensitive document sent by email. Until we can do it properly, we prefer to say so.",
      },
    ],
  },
  {
    id: "unlock-pdf",
    categories: ["pdf"],
    status: "COMING_SOON",
    processingMode: "client",
    icon: "unlock",
    multiple: false,
    mimeTypes: PDF_MIME,
    extensions: PDF_EXT,
    formatsLabel: "PDF",
    maxFileSize: 50 * MB,
    name: { fr: "Déverrouiller un PDF", en: "Unlock PDF" },
    short: {
      fr: "Retirer la protection d'un PDF dont vous possédez le mot de passe.",
      en: "Remove protection from a PDF whose password you hold.",
    },
    h1: { fr: "Déverrouiller un PDF protégé", en: "Unlock a protected PDF" },
    subtitle: {
      fr: "Cet outil n'est pas encore disponible.",
      en: "This tool is not available yet.",
    },
    seoTitle: { fr: "Déverrouiller un PDF — Tools.cm", en: "Unlock a PDF — Tools.cm" },
    seoDescription: {
      fr: "Le retrait de protection d'un PDF est en préparation sur Tools.cm.",
      en: "Removing PDF protection is in preparation on Tools.cm.",
    },
    keywords: ["deverrouiller pdf", "enlever mot de passe pdf", "unlock pdf", "remove pdf password"],
    faq: [
      {
        q: {
          fr: "Pourrez-vous ouvrir un PDF dont je n'ai pas le mot de passe ?",
          en: "Will you open a PDF whose password I do not have?",
        },
        a: {
          fr: "Non. Cet outil servira uniquement à retirer une protection sur un document dont vous détenez déjà le mot de passe. Contourner la protection d'un document qui ne vous appartient pas n'est pas un service que nous proposerons.",
          en: "No. This tool will only remove protection from a document whose password you already hold. Bypassing protection on a document that is not yours is not a service we will offer.",
        },
      },
    ],
    about: [
      {
        fr: "Retirer un mot de passe est utile quand on doit déposer un relevé bancaire chiffré sur une plateforme qui refuse les fichiers protégés — à condition d'en connaître le mot de passe.",
        en: "Removing a password is useful when an encrypted bank statement has to be uploaded to a platform that rejects protected files — provided you know the password.",
      },
    ],
  },
];
