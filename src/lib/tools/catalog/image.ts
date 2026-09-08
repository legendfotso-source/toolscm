import type { ToolDefinition } from "@/types/tool";

const MB = 1024 * 1024;

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

export const imageTools: ToolDefinition[] = [
  {
    id: "remove-background",
    categories: ["image"],
    status: "BETA",
    processingMode: "client",
    icon: "removeBg",
    popular: true,
    multiple: false,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 20 * MB,
    name: { fr: "Supprimer l'arrière-plan", en: "Remove background" },
    short: {
      fr: "Détourez une personne ou un produit et obtenez un PNG transparent.",
      en: "Cut out a person or a product and get a transparent PNG.",
    },
    h1: {
      fr: "Supprimer l'arrière-plan d'une photo",
      en: "Remove the background from a photo",
    },
    subtitle: {
      fr: "Le détourage se fait sur votre appareil, votre photo n'est jamais envoyée.",
      en: "The cut-out runs on your device — your photo is never sent anywhere.",
    },
    seoTitle: {
      fr: "Supprimer l'arrière-plan d'une photo gratuitement — Tools.cm",
      en: "Remove a photo background for free — Tools.cm",
    },
    seoDescription: {
      fr: "Enlevez gratuitement l'arrière-plan d'une photo et obtenez un PNG transparent, directement dans votre navigateur.",
      en: "Remove a photo's background for free and get a transparent PNG, directly in your browser.",
    },
    keywords: [
      "supprimer arriere plan",
      "enlever fond photo",
      "detourer photo",
      "fond transparent",
      "fond blanc photo",
      "remove background",
      "transparent png",
      "cut out",
      "product photo",
    ],
    faq: [
      {
        q: {
          fr: "Pourquoi le premier usage est-il long ?",
          en: "Why is the first use slow?",
        },
        a: {
          fr: "Le modèle d'intelligence artificielle qui détecte le sujet pèse environ 40 Mo et doit être téléchargé une fois. Votre navigateur le garde ensuite en cache : les photos suivantes sont bien plus rapides. Sur une connexion lente, prévoyez une ou deux minutes au premier lancement.",
          en: "The AI model that finds the subject weighs about 40 MB and has to be downloaded once. Your browser then caches it, so later photos are much faster. On a slow connection, allow a minute or two for that first run.",
        },
      },
      {
        q: {
          fr: "Pourquoi cet outil est-il en bêta ?",
          en: "Why is this tool in beta?",
        },
        a: {
          fr: "Le détourage tourne entièrement sur votre appareil et demande de la mémoire. Sur un téléphone d'entrée de gamme ou un navigateur ancien, il peut échouer — nous vous le disons alors clairement au lieu de laisser la page bloquée. Le résultat est aussi meilleur sur un sujet net et bien séparé du fond.",
          en: "The cut-out runs entirely on your device and needs memory. On an entry-level phone or an older browser it can fail — we tell you plainly when it does, instead of leaving the page stuck. Results are also better on a sharp subject that stands out from its background.",
        },
      },
      {
        q: {
          fr: "Ma photo est-elle envoyée sur un serveur ?",
          en: "Is my photo sent to a server?",
        },
        a: {
          fr: "Non. Contrairement à la plupart des services de détourage, tout le calcul a lieu dans votre navigateur. Seul le modèle est téléchargé, jamais votre image.",
          en: "No. Unlike most background-removal services, all the computation happens in your browser. Only the model is downloaded — never your image.",
        },
      },
    ],
    about: [
      {
        fr: "Une photo de produit sur fond neutre se vend mieux sur WhatsApp Business, Facebook Marketplace ou Jumia qu'une photo prise sur une table encombrée. Le détourage isole le sujet en quelques secondes.",
        en: "A product photo on a clean background sells better on WhatsApp Business, Facebook Marketplace or Jumia than one shot on a cluttered table. Cutting out isolates the subject in seconds.",
      },
      {
        fr: "Vous pouvez récupérer un PNG transparent, à poser sur n'importe quel fond, ou directement une version sur fond blanc, prête pour une fiche produit ou une photo de profil professionnelle.",
        en: "You can take away a transparent PNG to drop on any background, or a white-background version straight away, ready for a product listing or a professional profile picture.",
      },
    ],
  },
  {
    id: "compress-image",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "compress",
    popular: true,
    multiple: true,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "Compresser une image", en: "Compress image" },
    short: {
      fr: "Réduisez le poids de vos photos sans les rendre floues.",
      en: "Cut the weight of your photos without making them blurry.",
    },
    h1: { fr: "Compresser une image gratuitement", en: "Compress an image for free" },
    subtitle: {
      fr: "Réduisez la taille de vos photos directement dans votre navigateur.",
      en: "Reduce the size of your photos directly in your browser.",
    },
    seoTitle: {
      fr: "Compresser une image gratuitement — Tools.cm",
      en: "Compress an image for free — Tools.cm",
    },
    seoDescription: {
      fr: "Réduisez gratuitement le poids de vos photos JPG, PNG ou WebP, directement dans votre navigateur.",
      en: "Reduce the weight of your JPG, PNG or WebP photos for free, directly in your browser.",
    },
    keywords: [
      "compresser image",
      "reduire taille photo",
      "photo trop lourde",
      "compresser jpg",
      "compress image",
      "reduce photo size",
      "optimize image",
    ],
    faq: [
      {
        q: {
          fr: "La qualité va-t-elle beaucoup baisser ?",
          en: "Will the quality drop a lot?",
        },
        a: {
          fr: "À 80 % de qualité, la différence est presque invisible à l'œil nu alors que le poids chute souvent de moitié. En dessous de 50 %, les aplats de couleur et le texte commencent à se dégrader. L'aperçu affiché est l'image réellement produite : comparez avant de télécharger.",
          en: "At 80% quality the difference is nearly invisible while the weight often halves. Below 50%, flat colour areas and text start to break down. The preview shown is the image actually produced: compare before you download.",
        },
      },
      {
        q: {
          fr: "Pourquoi limiter aussi la largeur ?",
          en: "Why also limit the width?",
        },
        a: {
          fr: "Parce que c'est souvent le vrai gain. Une photo de téléphone fait 4 000 pixels de large, alors qu'un site ou un formulaire n'en affiche que 1 200 au maximum. Réduire les dimensions allège bien plus que baisser la qualité, sans perte visible.",
          en: "Because that is usually where the real gain is. A phone photo is 4,000 pixels wide, while a website or a form displays 1,200 at most. Reducing the dimensions saves far more than lowering quality, with no visible loss.",
        },
      },
    ],
    about: [
      {
        fr: "Les photos prises avec un téléphone récent dépassent souvent 5 Mo. Trop lourdes pour un formulaire de candidature, lentes à envoyer sur une connexion limitée, et coûteuses en données pour celui qui les reçoit.",
        en: "Photos from a recent phone often exceed 5 MB. Too heavy for an application form, slow to send on a limited connection, and expensive in data for whoever receives them.",
      },
      {
        fr: "La compression combine deux leviers : la qualité d'encodage et les dimensions maximales. Les deux sont réglables, et la taille affichée est mesurée sur le fichier réellement généré.",
        en: "Compression combines two levers: encoding quality and maximum dimensions. Both are adjustable, and the size shown is measured on the file actually produced.",
      },
    ],
  },
  {
    id: "resize-image",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "resize",
    popular: true,
    multiple: false,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "Redimensionner une image", en: "Resize image" },
    short: {
      fr: "Fixez la largeur et la hauteur exactes dont vous avez besoin.",
      en: "Set the exact width and height you need.",
    },
    h1: { fr: "Redimensionner une image en ligne", en: "Resize an image online" },
    subtitle: {
      fr: "Choisissez vos dimensions ou un format prêt à l'emploi.",
      en: "Choose your dimensions or a ready-made preset.",
    },
    seoTitle: {
      fr: "Redimensionner une image gratuitement — Tools.cm",
      en: "Resize an image for free — Tools.cm",
    },
    seoDescription: {
      fr: "Changez gratuitement la largeur et la hauteur d'une image, directement dans votre navigateur.",
      en: "Change the width and height of an image for free, directly in your browser.",
    },
    keywords: [
      "redimensionner image",
      "changer taille photo",
      "resize image",
      "image pixels",
      "photo instagram",
      "photo whatsapp",
    ],
    faq: [
      {
        q: {
          fr: "Que fait « conserver les proportions » ?",
          en: "What does \"keep proportions\" do?",
        },
        a: {
          fr: "Elle empêche l'image d'être étirée. Vous renseignez une seule dimension et l'autre se calcule automatiquement. Décochez-la seulement si un format imposé compte plus que la déformation.",
          en: "It stops the image from being stretched. You enter one dimension and the other is worked out automatically. Only uncheck it if a required format matters more than distortion.",
        },
      },
      {
        q: {
          fr: "Puis-je agrandir une petite image ?",
          en: "Can I enlarge a small image?",
        },
        a: {
          fr: "Techniquement oui, mais l'image sera floue. L'agrandissement invente des pixels qui n'existent pas dans l'original ; il ne récupère aucun détail perdu.",
          en: "Technically yes, but it will be blurry. Enlarging invents pixels that are not in the original; it recovers no lost detail.",
        },
      },
    ],
    about: [
      {
        fr: "Chaque plateforme a ses dimensions : une photo de profil, une publication Instagram carrée, une image WhatsApp qui ne doit pas être recompressée. Les préréglages évitent de chercher les chiffres.",
        en: "Every platform has its dimensions: a profile picture, a square Instagram post, a WhatsApp image that should not be recompressed. The presets save you looking the numbers up.",
      },
    ],
  },
  {
    id: "crop-image",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "crop",
    multiple: false,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "Recadrer une image", en: "Crop image" },
    short: {
      fr: "Gardez seulement la partie utile de la photo, au format voulu.",
      en: "Keep only the useful part of a photo, in the ratio you want.",
    },
    h1: { fr: "Recadrer une image en ligne", en: "Crop an image online" },
    subtitle: {
      fr: "Déplacez le cadre sur la zone à garder, puis téléchargez.",
      en: "Drag the frame over the area to keep, then download.",
    },
    seoTitle: {
      fr: "Recadrer une image gratuitement — Tools.cm",
      en: "Crop an image for free — Tools.cm",
    },
    seoDescription: {
      fr: "Recadrez gratuitement une photo au format carré, 4:3 ou 16:9, directement dans votre navigateur.",
      en: "Crop a photo to square, 4:3 or 16:9 for free, directly in your browser.",
    },
    keywords: [
      "recadrer image",
      "couper photo",
      "rogner image",
      "crop image",
      "cut photo",
      "carre",
      "square",
    ],
    faq: [
      {
        q: {
          fr: "Le recadrage réduit-il la qualité ?",
          en: "Does cropping reduce quality?",
        },
        a: {
          fr: "Le recadrage lui-même ne dégrade rien : il coupe simplement des pixels. En revanche l'image est réenregistrée, donc un JPG subit un nouvel encodage. Pour un maximum de fidélité, enregistrez en PNG.",
          en: "The crop itself degrades nothing: it simply cuts pixels away. The image is re-saved though, so a JPG goes through a fresh encode. For maximum fidelity, save as PNG.",
        },
      },
    ],
    about: [
      {
        fr: "Une photo de profil réussie tient souvent à un recadrage serré sur le visage. Un article à vendre se voit mieux sans la moitié de la pièce autour.",
        en: "A good profile picture usually comes down to a tight crop on the face. An item for sale shows better without half the room around it.",
      },
    ],
  },
  {
    id: "jpg-to-png",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "convert",
    multiple: true,
    mimeTypes: ["image/jpeg", "image/webp"],
    extensions: ["jpg", "jpeg", "webp"],
    formatsLabel: "JPG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "JPG en PNG", en: "JPG to PNG" },
    short: {
      fr: "Convertissez une photo en PNG, sans perte à l'encodage.",
      en: "Convert a photo to PNG, with no loss at encoding.",
    },
    h1: { fr: "Convertir une image JPG en PNG", en: "Convert a JPG image to PNG" },
    subtitle: {
      fr: "Conversion instantanée, directement sur votre appareil.",
      en: "Instant conversion, directly on your device.",
    },
    seoTitle: { fr: "Convertir JPG en PNG — Tools.cm", en: "Convert JPG to PNG — Tools.cm" },
    seoDescription: {
      fr: "Convertissez gratuitement vos images JPG en PNG, directement dans votre navigateur.",
      en: "Convert your JPG images to PNG for free, directly in your browser.",
    },
    keywords: ["jpg en png", "jpeg en png", "convertir png", "jpg to png", "convert to png"],
    faq: [
      {
        q: {
          fr: "Le PNG sera-t-il plus net que le JPG ?",
          en: "Will the PNG be sharper than the JPG?",
        },
        a: {
          fr: "Non. Ce qui a été perdu à la compression JPG ne revient pas. Le PNG évite simplement toute perte supplémentaire lors des enregistrements suivants.",
          en: "No. What JPG compression already discarded does not come back. PNG simply avoids any further loss on subsequent saves.",
        },
      },
      {
        q: { fr: "Pourquoi le fichier est-il plus lourd ?", en: "Why is the file heavier?" },
        a: {
          fr: "Le PNG est un format sans perte : il conserve chaque pixel exactement, ce qui coûte de la place. C'est normal, et c'est le prix de l'absence de perte.",
          en: "PNG is a lossless format: it keeps every pixel exactly, which costs space. That is expected, and it is the price of losing nothing.",
        },
      },
    ],
    about: [
      {
        fr: "Le PNG est demandé quand l'image doit rester nette après plusieurs modifications, ou quand un service refuse le JPG — certains formulaires officiels, certains logiciels de mise en page.",
        en: "PNG is asked for when an image has to stay clean through several edits, or when a service refuses JPG — some official forms, some layout software.",
      },
    ],
  },
  {
    id: "png-to-jpg",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "convert",
    multiple: true,
    mimeTypes: ["image/png", "image/webp"],
    extensions: ["png", "webp"],
    formatsLabel: "PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "PNG en JPG", en: "PNG to JPG" },
    short: {
      fr: "Convertissez un PNG en JPG bien plus léger, avec fond blanc.",
      en: "Turn a PNG into a much lighter JPG, on a white background.",
    },
    h1: { fr: "Convertir une image PNG en JPG", en: "Convert a PNG image to JPG" },
    subtitle: {
      fr: "Choisissez la qualité et la couleur de fond, puis téléchargez.",
      en: "Choose the quality and the background colour, then download.",
    },
    seoTitle: { fr: "Convertir PNG en JPG — Tools.cm", en: "Convert PNG to JPG — Tools.cm" },
    seoDescription: {
      fr: "Convertissez gratuitement vos images PNG en JPG plus légères, directement dans votre navigateur.",
      en: "Convert your PNG images into lighter JPGs for free, directly in your browser.",
    },
    keywords: ["png en jpg", "png en jpeg", "convertir jpg", "png to jpg", "convert to jpeg"],
    faq: [
      {
        q: {
          fr: "Que devient la transparence ?",
          en: "What happens to transparency?",
        },
        a: {
          fr: "Le JPG ne gère pas la transparence. Les zones transparentes sont remplies par la couleur de fond que vous choisissez, blanche par défaut.",
          en: "JPG has no transparency. Transparent areas are filled with the background colour you pick, white by default.",
        },
      },
    ],
    about: [
      {
        fr: "Un PNG de capture d'écran ou de photo peut peser plusieurs mégaoctets. En JPG, le même contenu tombe souvent à quelques centaines de kilooctets, ce qui suffit pour un envoi par email ou un dépôt en ligne.",
        en: "A screenshot or photo saved as PNG can weigh several megabytes. As JPG the same content often drops to a few hundred kilobytes, which is plenty for an email or an online upload.",
      },
    ],
  },
  {
    id: "passport-photo",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "passport",
    multiple: false,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 20 * MB,
    name: { fr: "Photo d'identité", en: "Passport photo" },
    short: {
      fr: "Recadrez une photo au format exact 4×4 cm, 2×2 pouces ou sur mesure.",
      en: "Crop a photo to an exact 4×4 cm, 2×2 inch or custom size.",
    },
    h1: { fr: "Créer une photo d'identité", en: "Make a passport photo" },
    subtitle: {
      fr: "Cadrez votre visage au format demandé, à 300 DPI, prêt à imprimer.",
      en: "Frame your face at the required size, at 300 DPI, ready to print.",
    },
    seoTitle: {
      fr: "Photo d'identité en ligne gratuite — Tools.cm",
      en: "Free passport photo maker — Tools.cm",
    },
    seoDescription: {
      fr: "Créez gratuitement une photo d'identité aux dimensions 4×4 cm ou 2×2 pouces, directement dans votre navigateur.",
      en: "Create a passport photo at 4×4 cm or 2×2 inch for free, directly in your browser.",
    },
    keywords: [
      "photo identite",
      "photo passeport",
      "photo 4x4",
      "photo cni",
      "passport photo",
      "id photo",
      "visa photo",
    ],
    faq: [
      {
        q: {
          fr: "Cette photo sera-t-elle acceptée par l'administration ?",
          en: "Will this photo be accepted by the authorities?",
        },
        a: {
          fr: "Nous ne pouvons pas le garantir. Les exigences varient selon le pays et l'institution : proportion du visage, fond, expression, tenue, ancienneté de la photo. Cet outil produit une image aux dimensions exactes que vous demandez, à 300 DPI. Vérifiez toujours les consignes officielles de l'organisme concerné.",
          en: "We cannot guarantee it. Requirements vary by country and institution: face proportions, background, expression, clothing, how recent the photo is. This tool produces an image at exactly the dimensions you ask for, at 300 DPI. Always check the official instructions of the body concerned.",
        },
      },
      {
        q: {
          fr: "Puis-je obtenir un fond blanc ?",
          en: "Can I get a white background?",
        },
        a: {
          fr: "Cet outil recadre, il ne remplace pas le fond. Passez d'abord votre photo par l'outil « Supprimer l'arrière-plan » en choisissant la sortie sur fond blanc, puis revenez ici pour le cadrage.",
          en: "This tool crops; it does not replace the background. Run your photo through \"Remove background\" first, choosing the white-background output, then come back here for the framing.",
        },
      },
    ],
    about: [
      {
        fr: "Le format 4×4 cm est le plus demandé au Cameroun pour les concours, les dossiers scolaires et la carte nationale d'identité. Le 2×2 pouces correspond aux visas américains, le 35×45 mm au passeport de nombreux pays européens.",
        en: "The 4×4 cm format is the one most often asked for in Cameroon for exams, school files and the national ID card. 2×2 inch matches US visas, 35×45 mm the passport of many European countries.",
      },
      {
        fr: "Le résultat est calculé à 300 points par pouce, la densité attendue par un photographe pour une impression nette. Une photo prise de trop loin ne pourra pas être agrandie sans devenir floue.",
        en: "The result is computed at 300 dots per inch, the density a print shop expects for a sharp result. A photo taken from too far away cannot be enlarged without going blurry.",
      },
    ],
  },
  {
    id: "watermark-image",
    categories: ["image"],
    status: "AVAILABLE",
    processingMode: "client",
    icon: "watermark",
    multiple: true,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 50 * MB,
    name: { fr: "Ajouter un filigrane", en: "Add watermark" },
    short: {
      fr: "Apposez votre nom ou celui de votre boutique sur vos photos.",
      en: "Stamp your name or your shop's name onto your photos.",
    },
    h1: { fr: "Ajouter un filigrane sur une image", en: "Add a watermark to an image" },
    subtitle: {
      fr: "Texte, position, taille et transparence — tout se règle ici.",
      en: "Text, position, size and transparency — all set right here.",
    },
    seoTitle: {
      fr: "Ajouter un filigrane sur une photo — Tools.cm",
      en: "Add a watermark to a photo — Tools.cm",
    },
    seoDescription: {
      fr: "Ajoutez gratuitement un filigrane texte sur vos images, directement dans votre navigateur.",
      en: "Add a text watermark to your images for free, directly in your browser.",
    },
    keywords: [
      "filigrane",
      "watermark",
      "signature photo",
      "proteger photo",
      "marque photo",
      "logo texte",
    ],
    faq: [
      {
        q: {
          fr: "Le filigrane peut-il être retiré ?",
          en: "Can the watermark be removed?",
        },
        a: {
          fr: "Il est incrusté dans les pixels, donc il n'y a pas de « calque » à désactiver. Quelqu'un de déterminé peut toutefois le recouvrir ou recadrer l'image. Un filigrane décourage la reprise, il ne l'empêche pas absolument.",
          en: "It is burned into the pixels, so there is no layer to switch off. Someone determined can still paint over it or crop the image. A watermark discourages reuse; it does not absolutely prevent it.",
        },
      },
    ],
    about: [
      {
        fr: "Les photos de produits publiées sur Facebook ou WhatsApp sont souvent reprises telles quelles par d'autres vendeurs. Un filigrane discret avec le nom de la boutique et un numéro rend la reprise moins intéressante.",
        en: "Product photos posted on Facebook or WhatsApp are often lifted as-is by other sellers. A discreet watermark with the shop name and a number makes that less appealing.",
      },
    ],
  },
  {
    id: "blur-background",
    categories: ["image"],
    status: "BETA",
    processingMode: "client",
    icon: "blur",
    multiple: false,
    mimeTypes: IMAGE_MIME,
    extensions: IMAGE_EXT,
    formatsLabel: "JPG, PNG, WebP",
    maxFileSize: 20 * MB,
    name: { fr: "Flouter l'arrière-plan", en: "Blur background" },
    short: {
      fr: "Gardez le sujet net et floutez ce qu'il y a derrière.",
      en: "Keep the subject sharp and blur everything behind it.",
    },
    h1: { fr: "Flouter l'arrière-plan d'une photo", en: "Blur the background of a photo" },
    subtitle: {
      fr: "Effet portrait, calculé entièrement sur votre appareil.",
      en: "Portrait effect, computed entirely on your device.",
    },
    seoTitle: {
      fr: "Flouter l'arrière-plan d'une photo — Tools.cm",
      en: "Blur a photo background — Tools.cm",
    },
    seoDescription: {
      fr: "Floutez gratuitement l'arrière-plan d'une photo tout en gardant le sujet net, dans votre navigateur.",
      en: "Blur a photo's background while keeping the subject sharp, free and in your browser.",
    },
    keywords: [
      "flouter arriere plan",
      "flou portrait",
      "fond flou",
      "blur background",
      "portrait mode",
      "bokeh",
    ],
    faq: [
      {
        q: {
          fr: "Cet outil utilise-t-il le même modèle que le détourage ?",
          en: "Does this use the same model as background removal?",
        },
        a: {
          fr: "Oui. Le sujet est isolé exactement de la même manière, puis reposé net sur une copie floutée de la photo d'origine. Si vous avez déjà utilisé le détourage, le modèle est en cache et le traitement démarre plus vite.",
          en: "Yes. The subject is isolated in exactly the same way, then laid sharp over a blurred copy of the original photo. If you have already used background removal, the model is cached and processing starts faster.",
        },
      },
    ],
    about: [
      {
        fr: "L'effet portrait des téléphones récents fait exactement cela : détecter le sujet et flouter le reste. Cet outil l'applique après coup, sur une photo déjà prise.",
        en: "The portrait mode on recent phones does exactly this: detect the subject and blur the rest. This tool applies it after the fact, to a photo you already took.",
      },
    ],
  },
];
