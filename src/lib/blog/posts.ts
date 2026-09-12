/**
 * The blog.
 *
 * This is not decoration and it is not content marketing in the usual sense.
 * Tools.cm's binding constraint is traffic, not features: a tool nobody finds
 * earns nothing, and the searches that matter here — "réduire taille pdf",
 * "photo 4x4 identité" — are typed by people with an immediate problem and no
 * patience.
 *
 * So every post is written to be the page that actually answers the question,
 * in French, for someone on a phone. Each one ends at a tool that does the
 * thing. None of them pretend the tool is the only way to do it.
 *
 * Posts are structured data rather than markdown files: no parser dependency,
 * no build step, and the renderer controls every element — which matters when
 * the audience is on 3G and a stray heavy embed costs them real money.
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "note"; text: string }
  | { kind: "tool"; id: string; label: string };

export type Post = {
  slug: string;
  title: string;
  description: string;
  /** ISO date. Used for sitemap freshness and the visible byline. */
  date: string;
  /** The tool this post exists to lead to. */
  tool: string;
  body: Block[];
};

export const POSTS: Post[] = [
  {
    slug: "reduire-taille-pdf-telephone",
    title: "Comment réduire la taille d'un PDF depuis votre téléphone",
    description:
      "Un PDF trop lourd pour un formulaire en ligne ou pour WhatsApp ? Voici pourquoi il est lourd, et comment le réduire sur un téléphone Android sans rien installer.",
    date: "2026-09-12",
    tool: "compress-pdf",
    body: [
      {
        kind: "p",
        text: "Vous scannez trois pages avec votre téléphone, et le fichier fait 12 Mo. Le formulaire en ligne refuse au-dessus de 2 Mo. C'est une des situations les plus frustrantes qui soient, et elle a une explication simple.",
      },
      { kind: "h", text: "Pourquoi un PDF scanné est si lourd" },
      {
        kind: "p",
        text: "Un PDF de texte tapé ne contient que du texte : quelques dizaines de kilo-octets. Un PDF scanné, lui, ne contient pas de texte du tout — il contient des photographies de vos pages. Un appareil photo moderne produit des images de 8 à 12 mégapixels, et trois de ces images pèsent naturellement plusieurs mégaoctets.",
      },
      {
        kind: "p",
        text: "Réduire un tel fichier revient donc à réduire la définition de ces photos. C'est un compromis : moins de définition, fichier plus petit, texte un peu moins net. Toute la question est de savoir jusqu'où aller.",
      },
      { kind: "h", text: "Quelle qualité choisir" },
      {
        kind: "list",
        items: [
          "150 DPI — le texte reste parfaitement lisible à l'écran et à l'impression courante. C'est le bon choix dans presque tous les cas.",
          "110 DPI — pour un formulaire qui impose une limite serrée. Lisible, un peu moins net.",
          "80 DPI — à réserver aux cas désespérés. Les petits caractères deviennent difficiles.",
        ],
      },
      {
        kind: "note",
        text: "Si votre PDF a été créé à partir d'un document tapé (Word, un relevé bancaire téléchargé), il est probablement déjà optimisé. Le compresser davantage peut ne rien gagner — voire l'alourdir. Dans ce cas, gardez l'original.",
      },
      { kind: "h", text: "Le faire sur votre téléphone" },
      {
        kind: "steps",
        items: [
          "Ouvrez l'outil de compression et choisissez votre fichier.",
          "Sélectionnez 150 DPI pour commencer.",
          "Lancez la compression et regardez la taille obtenue.",
          "Si le fichier est encore trop lourd, recommencez à 110 DPI.",
        ],
      },
      {
        kind: "p",
        text: "Le traitement se fait entièrement dans votre navigateur : votre document ne quitte jamais votre téléphone. C'est aussi pour cela que la vitesse dépend de votre appareil — un PDF de 200 pages demandera de la patience sur un téléphone d'entrée de gamme.",
      },
      { kind: "tool", id: "compress-pdf", label: "Compresser un PDF" },
      { kind: "h", text: "Si rien ne suffit" },
      {
        kind: "p",
        text: "Quand le fichier reste trop lourd même à 80 DPI, le problème est souvent le nombre de pages. Vérifiez si le formulaire demande vraiment le dossier complet : il est fréquent qu'une seule page soit exigée. Extraire cette page donne un fichier dix fois plus léger qu'aucune compression n'aurait atteint.",
      },
      { kind: "tool", id: "split-pdf", label: "Extraire des pages d'un PDF" },
    ],
  },
  {
    slug: "photo-identite-4x4-soi-meme",
    title: "Faire sa photo d'identité 4×4 soi-même, correctement",
    description:
      "Une photo d'identité au bon format se fabrique en deux minutes à partir d'une photo prise chez soi — à condition de respecter quelques règles. Voici lesquelles.",
    date: "2026-09-12",
    tool: "passport-photo",
    body: [
      {
        kind: "p",
        text: "Le format 4×4 cm est demandé pour de nombreux dossiers administratifs au Cameroun. Le fabriquer soi-même est tout à fait possible, et cela évite un déplacement. Mais une photo mal préparée fait rejeter un dossier, alors autant la faire correctement du premier coup.",
      },
      {
        kind: "note",
        text: "Vérifiez toujours le format exact exigé auprès du service qui reçoit votre dossier. Les administrations ne demandent pas toutes la même chose, et les exigences changent. Cet article explique comment produire le format que vous aurez identifié — il ne remplace pas cette vérification.",
      },
      { kind: "h", text: "Prendre la photo" },
      {
        kind: "list",
        items: [
          "Placez-vous devant un mur clair et uni. Un mur blanc ou beige convient ; évitez les motifs et les ombres portées.",
          "Tournez-vous vers une fenêtre, de jour. La lumière naturelle de face évite les ombres sous les yeux que produit un éclairage venu du plafond.",
          "Demandez à quelqu'un de prendre la photo à hauteur de vos yeux, à environ un mètre. Un selfie à bout de bras déforme le visage — le nez paraît plus grand, les oreilles disparaissent.",
          "Visage neutre, yeux ouverts, bouche fermée, tête droite.",
          "Retirez lunettes de soleil, casquette et tout ce qui masque le visage.",
        ],
      },
      { kind: "h", text: "La mettre au format" },
      {
        kind: "p",
        text: "Une photo d'identité n'est pas seulement une taille en centimètres : c'est aussi une résolution. Une image de 4×4 cm à 300 points par pouce fait 472 × 472 pixels. Imprimée, elle est nette. La même image redimensionnée à 100 pixels sera floue une fois imprimée, même si elle paraît correcte à l'écran.",
      },
      {
        kind: "steps",
        items: [
          "Ouvrez l'outil photo d'identité et choisissez votre photo.",
          "Sélectionnez le format 4×4 cm.",
          "Cadrez le visage : la tête doit occuper l'essentiel de la hauteur, avec un peu d'espace au-dessus.",
          "Téléchargez le résultat et faites-le imprimer sur papier photo.",
        ],
      },
      { kind: "tool", id: "passport-photo", label: "Créer une photo d'identité" },
      { kind: "h", text: "Les erreurs qui font rejeter un dossier" },
      {
        kind: "list",
        items: [
          "Fond coloré ou avec un motif visible.",
          "Ombre portée sur le mur derrière la tête.",
          "Visage trop petit dans le cadre, ou au contraire coupé.",
          "Photo imprimée sur du papier ordinaire plutôt que du papier photo.",
          "Sourire large — plusieurs administrations l'excluent explicitement.",
        ],
      },
      {
        kind: "p",
        text: "Si le fond de votre photo n'est pas assez uni, il est possible de le remplacer avant la mise au format.",
      },
      { kind: "tool", id: "remove-background", label: "Changer le fond d'une photo" },
    ],
  },
  {
    slug: "fusionner-documents-scannes-un-pdf",
    title: "Réunir plusieurs documents scannés en un seul PDF",
    description:
      "Acte de naissance, CNI, diplôme, photo : la plupart des dossiers demandent un fichier unique. Voici comment assembler proprement, dans le bon ordre.",
    date: "2026-09-12",
    tool: "merge-pdf",
    body: [
      {
        kind: "p",
        text: "« Veuillez joindre votre dossier en un seul fichier PDF. » La phrase est courante, et le dossier, lui, existe sous forme de cinq photos prises à des moments différents. Voici comment en faire un document propre.",
      },
      { kind: "h", text: "Commencez par l'ordre" },
      {
        kind: "p",
        text: "Avant de convertir quoi que ce soit, décidez de l'ordre des pièces — généralement celui de la liste fournie par l'administration. Un dossier dont les pièces suivent la liste demandée se traite plus vite qu'un dossier en désordre, même complet.",
      },
      { kind: "h", text: "Des photos vers un PDF" },
      {
        kind: "p",
        text: "Si vos pièces sont des photos, convertissez-les d'abord en un PDF unique. L'outil vous laisse choisir l'ordre, le format de page et les marges. A4 et « ajuster à la page » conviennent dans presque tous les cas.",
      },
      { kind: "tool", id: "jpg-to-pdf", label: "Convertir des images en PDF" },
      { kind: "h", text: "Des PDF entre eux" },
      {
        kind: "p",
        text: "Si certaines pièces sont déjà des PDF — un relevé de notes téléchargé, une attestation reçue par e-mail — assemblez-les avec l'outil de fusion, qui conserve la qualité d'origine de chaque document.",
      },
      { kind: "tool", id: "merge-pdf", label: "Fusionner des PDF" },
      {
        kind: "note",
        text: "Fusionner ne recompresse rien : le fichier final pèse la somme des fichiers de départ. Si le résultat dépasse la limite acceptée, compressez-le après la fusion, pas avant — vous garderez un meilleur contrôle du résultat.",
      },
      { kind: "h", text: "Vérifier avant d'envoyer" },
      {
        kind: "list",
        items: [
          "Toutes les pages sont-elles dans le bon sens ? Une page couchée se corrige en quelques secondes.",
          "Chaque pièce est-elle lisible une fois affichée en plein écran ?",
          "Le fichier respecte-t-il la taille maximale acceptée ?",
        ],
      },
      { kind: "tool", id: "rotate-pdf", label: "Pivoter les pages d'un PDF" },
    ],
  },
  {
    slug: "alleger-photo-whatsapp-sans-perdre-qualite",
    title: "Alléger une photo pour WhatsApp sans la rendre floue",
    description:
      "WhatsApp compresse déjà vos photos, souvent trop. Voici comment reprendre la main et envoyer une image nette qui reste légère.",
    date: "2026-09-12",
    tool: "compress-image",
    body: [
      {
        kind: "p",
        text: "Vous envoyez une photo d'un document par WhatsApp, et à l'arrivée le texte est illisible. Ce n'est pas votre appareil photo : c'est la compression automatique de l'application, qui traite une page de texte comme elle traiterait un coucher de soleil.",
      },
      { kind: "h", text: "Pourquoi WhatsApp abîme les documents" },
      {
        kind: "p",
        text: "Pour économiser la bande passante, WhatsApp réduit fortement les photos envoyées dans une conversation. Sur un paysage, la perte se voit à peine. Sur du texte fin, les contours deviennent flous et les petits caractères se brouillent.",
      },
      { kind: "h", text: "Deux solutions" },
      {
        kind: "p",
        text: "La première : envoyer le fichier en tant que document plutôt qu'en tant que photo. Dans le trombone, choisissez « Document » et non « Galerie ». WhatsApp transmet alors le fichier tel quel, sans le recompresser.",
      },
      {
        kind: "p",
        text: "La seconde, utile quand le fichier est trop lourd pour passer : le compresser vous-même, en gardant la main sur le compromis. Une qualité de 80 % avec une largeur maximale de 1600 pixels donne en général un fichier léger dont le texte reste lisible.",
      },
      {
        kind: "steps",
        items: [
          "Ouvrez l'outil de compression d'image et choisissez votre photo.",
          "Réglez la qualité autour de 80 % et la dimension maximale à 1600 pixels.",
          "Comparez la taille obtenue à l'original.",
          "Envoyez le résultat en tant que document, pas en tant que photo.",
        ],
      },
      { kind: "tool", id: "compress-image", label: "Compresser une image" },
      {
        kind: "note",
        text: "Pour un document de plusieurs pages, un PDF vaut mieux qu'une série de photos : un seul fichier, dans l'ordre, que le destinataire ouvre d'un geste.",
      },
      { kind: "tool", id: "jpg-to-pdf", label: "Convertir des images en PDF" },
    ],
  },
];

export function getPost(slug: string): Post | undefined {
  return POSTS.find((post) => post.slug === slug);
}

/** Newest first, which is the order a reader expects. */
export function listPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
}

/** Other posts to show at the foot of one, excluding itself. */
export function relatedPosts(slug: string, limit = 3): Post[] {
  return listPosts()
    .filter((post) => post.slug !== slug)
    .slice(0, limit);
}
