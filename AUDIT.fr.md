# Tools.cm — rapport d'audit et de mise à niveau

21 septembre 2026. Rédigé à partir du code de ce dépôt, dans le même commit que
ce fichier. La version anglaise, `AUDIT.md`, dit exactement la même chose.

La consigne était : auditer d'abord, ne changer que ce qui doit l'être, garder
toutes les fonctionnalités qui marchent, et rendre compte honnêtement à la fin.
Voici ce compte rendu. Quand quelque chose n'a pas été vérifié, il le dit.

Ce rapport a lui-même été relu avant envoi. Cette relecture a trouvé deux vrais
bugs de prix, deux fonctionnalités décrites dans le premier jet mais absentes du
code, et plusieurs phrases qui affirmaient plus que ce qui avait été vérifié.
Tout a été corrigé, et la section 3 les liste au lieu de les cacher.

---

## 1 — Ce qui fonctionnait déjà

J'ai lu le code avant de le modifier. L'essentiel du cahier des charges en 48
points était déjà construit. Pour être honnête, ce travail a ajouté une formule
d'abonnement, pas un nouveau produit.

**Les outils : 26, tous réels.**

| Catégorie | Outils | Statut |
| --- | --- | --- |
| PDF | 12 | tous disponibles |
| Image | 9 | 7 disponibles, 2 en bêta |
| Utilitaires | 5 | tous disponibles |

22 d'entre eux prennent un fichier, et tous les 22 le traitent dans le
navigateur. Le fichier n'est jamais envoyé, et c'est pour cela que la page de
confidentialité peut le dire. Les 4 autres (générateur de QR code, calculateur
d'âge, compteur de mots, convertisseur de casse) ne prennent aucun fichier. Les
deux outils d'arrière-plan (suppression et flou) téléchargent un modèle d'IA
depuis un serveur tiers à la première utilisation ; votre photo reste sur votre
appareil, et la page de l'outil comme la politique de confidentialité le
disent.

`tests/run-tool-tests.mjs` le vérifie avec un vrai navigateur : il envoie de
vrais fichiers aux outils et ouvre ce qui en ressort.

**Déjà en place :**

- **Français et anglais, complets.** 275 textes dans chaque langue après ce
  travail, aucun manquant d'un côté ou de l'autre (revérifié aujourd'hui).
- **Référencement.** Un titre, une description et des mots-clés pour chaque
  outil, un `sitemap.xml` et un `robots.txt` générés, et quatre guides rédigés
  qui renvoient vers des outils en ligne.
- **Mobile.** Les pages d'outils s'affichent sur 320 px de large sans défilement
  horizontal, et les zones à toucher font au moins 44 px. Les deux sont vérifiés
  par des tests dans un vrai navigateur.
- **Comptes.** E-mail et mot de passe, ou Google, via Supabase.
- **Sécurité des données (RLS).** Y compris une faille `security definer`
  trouvée en sondant la base de données en ligne avec la seule clé publique, et
  fermée dans le commit `fc0f22a`. Trente et une garanties de la base sont
  vérifiées sur un vrai PostgreSQL.
- **Une limite quotidienne décidée par le serveur**, avec des empreintes salées,
  pour que le navigateur ne puisse pas s'en accorder davantage.
- **Un tableau de bord admin sur `/admin`** : nombre de visiteurs, comptes,
  prix, et deux interrupteurs (`limits_enabled`, `payments_enabled`) tous deux
  **désactivés** par défaut.
- **Trois prestataires de paiement dans le code** : CamPay, NotchPay et Stripe.
  Leurs webhooks sont vérifiés par signature quand le prestataire en propose, et
  un index unique sur `(provider, transaction_id)` empêche de compter deux fois
  le même paiement.
- **Mobile Money manuel.** Le client envoie l'argent à un numéro MTN ou Orange,
  vous activez sa formule dans `/admin` avec l'identifiant de transaction, et un
  reçu est produit pour l'envoyer sur WhatsApp. Cela fonctionne dans les tests.
  Ce n'a jamais été utilisé en ligne ni avec de l'argent réel (voir section 7).

**Rien de tout cela n'a été reconstruit, et aucune fonctionnalité qui marchait
n'a été retirée.**

---

## 2 — Ce que j'ai modifié

Le site vendait une seule formule payante. Vous en avez demandé trois.

**Un seul tableau d'où viennent toutes les limites :**
`src/lib/payments/tiers.ts`. Pour Gratuit, Pro et Max, il fixe les opérations
par jour, les fichiers par lot, le plafond de taille, et si un lot peut être
téléchargé en un seul ZIP. Le tableau comparatif de la page Tarifs est **généré
à partir de ce fichier** : il ne peut donc pas afficher un chiffre que le code
n'utilise pas.

**Les formules que vous avez choisies :**

| | Gratuit | Pro | Max |
| --- | --- | --- | --- |
| Prix (par défaut) | 0 | 2 000 FCFA / mois | 5 000 FCFA / mois |
| Opérations par jour | 3 | sans limite | sans limite |
| Fichiers par lot | 3 | 10 | 50 |
| Taille de fichier | limite propre à l'outil | ×2 | ×4 |
| Téléchargement du lot en ZIP | non | oui | oui |

Gratuit garde les lots de trois, comme vous l'avez demandé. Fusionner des PDF
est l'un des outils les plus utilisés, et le limiter à un seul fichier pour le
revendre retirerait quelque chose à la formule que la plupart des gens
utilisent.

**Où chaque limite est appliquée, sans détour :**

- La **limite quotidienne** est décidée par le serveur, et le navigateur ne peut
  pas la contourner.
- Les **limites de lot et de taille** s'appliquent dans le navigateur. Les
  fichiers n'atteignent jamais le serveur (c'est la promesse de
  confidentialité), donc le serveur n'a rien à compter. Quelqu'un qui modifie le
  JavaScript de la page peut contourner ces limites sur son propre appareil. Ce
  sont des limites de produit, pas des barrières de sécurité, et rien de ce qui
  vous coûte de l'argent n'en dépend. La page Tarifs le dit désormais sous le
  tableau comparatif.

**Un seul prix, partout.** Les deux prix payants viennent du seul réglage
`price_xaf` de `/admin` (et `price_usd` pour la carte). Max en est calculé
(×2,5, arrondi aux 500 FCFA les plus proches ; prix carte aux 50 centimes les
plus proches). Il n'est jamais saisi à un deuxième endroit. Une seule fonction,
`plansForTier()`, transforme les réglages en prix, sur la même règle d'arrondi
(`tierPriceXaf()`), et **tous les endroits où un prix apparaît les utilisent** :
les cartes de la page Tarifs, les boutons de paiement, les instructions Mobile
Money, la fenêtre de limite dans un outil, la page compte, `/admin`, et l'API
qui facture réellement. Ce que le client lit est, par construction, ce qu'il
paie. Le prix Pro n'est jamais arrondi : si vous tapez 2 250, le site affiche
2 250.

**La formule suit tout le parcours** : paiement → prestataire → webhook →
paiement enregistré → abonnement → ce que le site affiche. Deux règles sont
appliquées et testées. Une montée en gamme en cours de période **élève** la
formule sur le même abonnement. Un renouvellement moins cher **ne rétrograde
jamais** quelqu'un qui a déjà payé Max jusqu'à une date qui n'est pas encore
arrivée.

**Téléchargement ZIP sans nouvelle dépendance :** `src/lib/tools/zip.ts`.
JSZip ajouterait environ 100 Ko (compressés) que chaque visiteur télécharge, y
compris ceux qui ne paient jamais, sur un site dont la promesse principale est
de s'ouvrir vite sur un téléphone Android bon marché. L'archive est écrite
directement, sans compression, parce que les PDF et JPEG sont déjà compressés et
les recompresser fait gagner moins de 2 %. Le code protège contre la faille Zip
Slip, renomme les fichiers en double au lieu d'en perdre un, et refuse d'écrire
une archive corrompue au-delà de 4 Go.

**Pro ou Max partout où une formule s'achète ou s'affiche :**

- la page de paiement laisse le client choisir Pro ou Max ;
- les instructions Mobile Money aussi, et le message WhatsApp pré-rempli nomme
  la formule, pour que vous sachiez quoi activer ;
- `/admin` a un sélecteur Pro/Max, et le montant suit ;
- le reçu indique la formule achetée ;
- `/account` affiche le nom de la formule et ce qu'elle comprend.

**Aussi :** `supabase/migrations/0002_tiers.sql`, 33 nouveaux textes dans
chaque langue (et les deux qui contenaient le prix Pro en texte fixe retirés),
et DEPLOY.md et README mis à jour.

---

## 3 — Ce qui a été corrigé

**Trouvé en relisant ce rapport :**

1. **Choisir Max à la caisse affichait les prix Pro.** Le serveur aurait
   facturé ceux de Max. Les paiements sont désactivés, donc personne n'a été
   touché, mais c'est exactement le « faux prix » que le cahier des charges
   interdit. Corrigé : les boutons suivent désormais la formule choisie.
2. **La carte Max affichait 12 $, mais une carte bancaire aurait été débitée de
   12,50 $.** Les prix des cartes étaient du texte écrit dans les fichiers de
   traduction, donc ils cessaient aussi de correspondre dès que le prix changeait
   dans `/admin`. Corrigé : tous les prix affichés sont calculés, et un test
   échoue si un prix est de nouveau écrit dans un fichier de traduction.
3. **Le sélecteur de formule de `/admin` et le nom de la formule sur `/account`
   manquaient.** Le premier jet de ce rapport décrivait les deux. Ils avaient été
   perdus pendant les tests, quand une commande destinée à annuler une erreur
   volontaire a aussi annulé du travail pas encore enregistré, et le premier jet
   n'a pas été revérifié contre le code ensuite. Les deux sont maintenant
   construits. Jusque-là, **Max ne pouvait pas du tout être activé depuis
   `/admin`**, et les instructions Mobile Money ne parlaient que de Pro.
4. **« Usage commercial autorisé » figurait sur la carte Max.** C'est moi qui
   l'avais écrit. Vos conditions d'utilisation ne disent rien de tel, et cela
   laissait entendre que Gratuit et Pro l'interdisent. Retiré.
5. **La page Tarifs disait que toutes les limites sont appliquées par le
   serveur.** C'était faux (voir section 2). Corrigé.
6. **Sur téléphone, la colonne Max du tableau comparatif était cachée** derrière
   un défilement horizontal que rien ne signalait. Le tableau tient maintenant
   sur un écran de 320 px.
7. **Petites corrections d'affichage :** « 2 000 FCFA » passait sur deux lignes
   sur les cartes ; le badge « Recommandé » était en blanc sur violet pâle,
   illisible ; `/account` disait encore « un fichier à la fois » pour Gratuit.

**Trouvé pendant la construction :**

8. **Des clients payants auraient pu être rétrogradés sans que personne ne le
   remarque.** Vercel redéploie dès que vous envoyez le code, mais
   `0002_tiers.sql` se lance à la main ensuite. Entre les deux, le nouveau code
   demandait une colonne qui n'existait pas encore, et le cas d'erreur renvoyait
   la formule **gratuite**, sans rien dans aucun journal. Désormais le code s'en
   aperçoit et redemande sans cette colonne, et un test reproduit cette
   situation.
9. **La fausse base de données des tests renvoyait des lignes entières**, quelles
   que soient les colonnes demandées, et ne pouvait donc pas détecter le bug 8.
   Elle se comporte maintenant comme la vraie. Cela a révélé qu'un de mes
   nouveaux tests passait pour une mauvaise raison ; il a été réécrit.
10. **Caractères invisibles dans le code source.** L'outil qui a écrit `zip.ts` a
    transformé les codes d'échappement de « tout caractère de contrôle » en trois
    octets invisibles littéraux. Cela réduisait discrètement « retirer les
    caractères de contrôle » à « retirer trois caractères précis ». Réécrit.

---

## 4 — Quel prestataire de paiement

**Écrits et testés dans le code : trois. En ligne : aucun.** Cela dépend de
comptes à ouvrir, pas du code.

| Prestataire | Construit | Ce qu'il vous faut |
| --- | --- | --- |
| **CamPay** | oui | un compte marchand camerounais. C'est celui à utiliser. |
| **NotchPay** | oui | un compte et sa clé de webhook |
| **Stripe** | oui | un compte (voir ci-dessous) |

**CamPay est le bon choix pour le Cameroun.** Il est camerounais, conçu pour MTN
et Orange Money, et le client paie depuis le téléphone qu'il a déjà. CamPay ne
publie pas de moyen de signer ses webhooks, donc ici un webhook est traité
**comme un indice, pas comme une preuve**. Il déclenche seulement une
vérification authentifiée auprès des serveurs de CamPay, et l'accès n'est donné
que si CamPay confirme `SUCCESSFUL`. Une fausse notification n'obtient rien.
`CAMPAY_ENVIRONMENT` est réglé par défaut sur le **bac à sable**, pour qu'un
réglage mal tapé lance un paiement de test au lieu de prendre de l'argent réel.

Les webhooks NotchPay sont vérifiés par signature. Ceux de Stripe sont vérifiés
avec le secret `whsec_`.

**Stripe : non vérifié.** Je n'ai pas pu ouvrir la liste des pays pris en charge
par Stripe depuis cette machine, et je n'ai pas confirmé qu'une entreprise
immatriculée au Cameroun peut ouvrir un compte Stripe. Vérifiez sur
[stripe.com/global](https://stripe.com/global) avant de compter dessus.
L'intégration est prête si c'est possible pour vous, ou si vous facturez un jour
via une société immatriculée ailleurs.

**Rien ne prélève d'argent automatiquement pour l'instant.** Chaque prestataire
ne fait rien sans ses clés, **et** il est bloqué une seconde fois par
`payments_enabled` dans `/admin`, qui est désactivé. Tant que vous ne l'activez
pas, les clients voient les instructions Mobile Money, et vous activez leur
formule à la main dans `/admin`. Cela produit un vrai reçu, et saisir deux fois
le même identifiant de transaction ne peut pas donner un second mois.

---

## 5 — Modifications de la base de données

Une migration : **`supabase/migrations/0002_tiers.sql`**.

- Crée le type `public.plan_tier` (`free`, `pro`, `max`).
- Ajoute `tier` à `public.subscriptions` : obligatoire, valeur par défaut
  `'pro'`.
- Ajoute `tier` à `public.payments`, pour qu'un remboursement ou un litige
  puisse être relié à ce qui a réellement été acheté.
- Met tous les abonnements existants à `'pro'`, puisque tout abonnement vendu
  avant cette migration était un abonnement Pro.

Elle peut être lancée plusieurs fois sans risque. Aucune table n'a été supprimée
et aucune règle de sécurité assouplie.

**Lancez-la juste après le déploiement.** Tant qu'elle n'a pas tourné, les
clients existants restent Pro, mais **aucun nouveau paiement ne peut être
enregistré**, même une activation manuelle. `/admin` affiche alors une erreur ;
il ne fait pas semblant de réussir.

---

## 6 — Variables d'environnement

**Obligatoires** pour tout ce qui dépasse les outils gratuits :

| Nom | Ce que c'est |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | l'adresse du projet Supabase (publique par nature) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | la clé publiable (publique par nature) |
| `SUPABASE_SERVICE_ROLE_KEY` | **un vrai secret** : elle contourne toutes les règles de la base. Uniquement dans Vercel. Jamais sur GitHub, jamais dans une discussion, jamais derrière `NEXT_PUBLIC_` |
| `USAGE_HASH_SALT` | n'importe quel long texte aléatoire que vous inventez. Ne jamais le changer ensuite |
| `ADMIN_EMAIL` | votre adresse e-mail, seulement jusqu'à votre première connexion. Supprimez-la ensuite |

**Facultatives (le code a des valeurs par défaut qui marchent) :**
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, `NEXT_PUBLIC_MTN_NUMBER`,
`NEXT_PUBLIC_MTN_NAME`, `NEXT_PUBLIC_ORANGE_NUMBER`, `NEXT_PUBLIC_ORANGE_NAME`,
`NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_ADSENSE_CLIENT`.

**Seulement quand un prestataire passe en ligne :** `CAMPAY_USERNAME`,
`CAMPAY_PASSWORD`, `CAMPAY_ENVIRONMENT` ; `NEXT_PUBLIC_NOTCHPAY_PUBLIC_KEY`,
`NOTCHPAY_WEBHOOK_HASH` ; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

Les prix **ne sont pas** des variables d'environnement. Ils se règlent dans
`/admin`.

---

## 7 — Ce qui dépend de quelque chose d'extérieur au code

Rien de tout cela n'est du code inachevé. Chaque point demande une identité, un
compte ou une décision que vous seul pouvez fournir.

1. **Un compte marchand CamPay.** L'intégration ne peut pas être testée sur un
   compte réel depuis ici. La demande est à déposer par vous.
2. **Un compte NotchPay**, si vous voulez un second prestataire.
3. **Stripe**, selon la vérification de la section 4.
4. **Le site en ligne n'a pas été vérifié.** Le réseau sur lequel ce travail a
   été fait bloque `toolscm.vercel.app` : je n'ai pu charger aucune page de votre
   déploiement. Tout ce rapport a été vérifié contre le code et les tests.
   **Rien** n'y décrit ce qui tourne actuellement en ligne.
5. **La connexion Google pour tout le monde.** Tant que l'écran de consentement
   Google Cloud n'est pas publié, seuls les utilisateurs de test peuvent se
   connecter avec Google. La connexion par e-mail n'est pas concernée.
6. **AdSense.** Aucun code publicitaire n'apparaît tant que
   `NEXT_PUBLIC_ADSENSE_CLIENT` est vide. L'approbation dépend de Google.
7. **Le domaine `tools.cm`** appartient à quelqu'un d'autre. Le site fonctionne
   très bien sur l'adresse Vercel.
8. **Un premier vrai paiement.** Le code de paiement a tourné sur une base de
   test et sur un vrai PostgreSQL, mais jamais avec de l'argent réel. Faites un
   paiement vous-même, depuis un second compte, avant de parler du site à qui
   que ce soit.
9. **La création de compte pour le public** (section 9) : un vrai
   expéditeur d'e-mails dans Supabase, ou la confirmation d'e-mail
   désactivée ; et l'écran de consentement Google publié.
10. **Deux phrases marketing contiennent encore un prix fixe** : « Pro à 2 000
   FCFA/mois » sur la page d'accueil, et la description de la page Tarifs pour
   les moteurs de recherche. Tout le reste suit `/admin`. Si vous changez le
   prix, modifiez ces deux phrases à la main (DEPLOY.md, section « If something
   breaks », indique où).

---

## 8 — Comment déployer cette version

`DEPLOY.md` détaille chaque étape. En bref :

1. **Décompressez et vérifiez que ça tourne :** `npm install`, puis
   `npm run dev`, puis ouvrez http://localhost:3000.
2. **Envoyez sur GitHub.** L'historique est déjà enregistré :
   `git remote add origin …`, `git branch -M main`, `git push -u origin main`.
   Aucun secret n'est dans le dépôt ; `.env.local` est exclu volontairement.
3. **Déployez sur Vercel.** Importez le dépôt et ajoutez les variables de la
   section 6 **avant** de cliquer sur Deploy.
4. **Lancez la migration juste après le déploiement.** Dans Supabase, ouvrez
   SQL Editor, collez `supabase/migrations/0002_tiers.sql`, et cliquez sur Run.
   (Sur un projet tout neuf, lancez d'abord `0001_init.sql`.)
5. **Indiquez à Supabase l'adresse du site** : Authentication → URL
   Configuration (Site URL et Redirect URLs).
6. **Devenez administrateur.** Inscrivez-vous sur le site en ligne avec
   l'adresse `ADMIN_EMAIL` et ouvrez `/admin` pour confirmer. Ensuite, supprimez
   `ADMIN_EMAIL` dans Vercel et redéployez.
7. **Faites un vrai paiement à la main**, depuis un second compte, pour Pro puis
   pour Max. Vérifiez que `/account` affiche la bonne formule et que le reçu la
   nomme.
8. **Seulement ensuite**, activez **Enforce the daily limit** dans `/admin`.

Avant l'étape 6, assurez-vous que le public peut créer un compte (section 9,
et DEPLOY.md étape 5). Sinon, personne ne peut utiliser un outil.

Laissez `payments_enabled` désactivé tant que vous n'avez pas de compte chez un
prestataire et que vous n'avez pas vu un paiement de test aboutir.

---

## 9 — Un compte est désormais nécessaire pour utiliser un outil

Ajouté après le reste de ce rapport, à votre demande : un visiteur non
connecté ne peut plus utiliser les outils du site.

**Ce qui reste public :** la page d'accueil, la page et les explications de
chaque outil, les tarifs, les guides, les pages légales, la connexion et
l'inscription. Les moteurs de recherche continuent d'indexer le site, et un
visiteur voit ce qu'un compte lui apporte.

**Ce qui demande un compte :** utiliser n'importe lequel des 26 outils.

**Où c'est appliqué :**

- **Dans la page.** L'outil est remplacé par « Connectez-vous pour utiliser
  cet outil », avec *Créer un compte* et *Se connecter*. Les deux ramènent le
  visiteur sur le même outil ensuite. Le code de l'outil n'est même pas
  téléchargé.
- **Sur le serveur.** `/api/usage` répond `401 sign_in_required` à un appel
  sans session, avant de compter quoi que ce soit. Les 22 outils qui prennent
  un fichier le consultent tous avant de démarrer.
- **Limite honnête :** les fichiers sont traités dans le navigateur et
  n'atteignent jamais le serveur, donc quelqu'un qui réécrit le JavaScript de
  la page sur sa propre machine peut encore y faire tourner un outil. Les 4
  outils sans fichier (QR code, compteur de mots, calculateur d'âge,
  convertisseur de casse) sont fermés dans la page seulement. C'est le même
  compromis que pour la limite quotidienne, et le prix de la promesse de
  confidentialité.

**Corrigé au passage :**

- Les formulaires de connexion et d'inscription ignoraient `?next=` : la page
  de paiement envoyait vers `/signin?next=/pricing`, puis la personne
  atterrissait sur `/account`. Désormais elle revient d'où elle venait.
- **Une faille de sécurité :** le retour de connexion acceptait toute adresse
  commençant par `/`, et `//evil.example` commence par `/`. Un lien piégé
  aurait pu envoyer quelqu'un de votre site vers un autre. Seuls les vrais
  chemins de ce site sont acceptés maintenant, et un test essaie dix variantes
  hostiles.
- Si la confirmation d'e-mail est désactivée dans Supabase, un nouveau compte
  va directement à son outil au lieu d'attendre un e-mail qui n'arrive jamais.
- Toutes les pages qui promettaient « aucun compte requis » disent maintenant
  l'inverse, y compris la FAQ des tarifs, les conditions d'utilisation et **la
  politique de confidentialité**, qui liste ce qu'un compte conserve :
  e-mail, mode de connexion (avec le nom et la photo transmis par Google),
  date de création, et formule et paiements pour les abonnés. Le décompte
  quotidien reste tenu par appareil, sans lien avec le compte.

**⚠ Avant de déployer ceci, assurez-vous que le public peut créer un compte.**
Tel que Supabase est livré, il ne le peut pas :

- L'expéditeur d'e-mails intégré à Supabase n'est, selon sa propre
  documentation, « pas destiné à la production ». Il envoie au maximum **2
  messages par heure**, et seulement aux adresses de votre équipe Supabase.
  Toute autre personne qui s'inscrit par e-mail ne reçoit jamais le lien de
  confirmation, et ne peut donc jamais utiliser un outil. Branchez un vrai
  expéditeur (SMTP) dans Supabase, ou désactivez *Confirm email*. DEPLOY.md,
  étape 5, explique les deux.
- La connexion Google ne marche que pour les utilisateurs de test déclarés
  dans Google Cloud tant que l'écran de consentement n'est pas publié.

**Bon à savoir :** la limite gratuite quotidienne est toujours comptée **par
appareil**, pas par compte. Un compte utilisé sur deux téléphones a droit à 3
opérations sur chacun. La compter par compte demanderait une petite
modification de la base. Je ne l'ai pas faite, car vous ne l'avez pas
demandée, mais c'est l'étape logique maintenant que tout le monde a un compte.

---

## 10 — Le compte du propriétaire, et l'approbation d'un client qui a payé

Deux choses qui manquaient, et une propriété commune : ni l'une ni l'autre ne
peut être définie depuis un navigateur.

### Un compte sans aucune limite

Il existe désormais une quatrième formule, `owner` : aucun quota quotidien,
aucune limite de lot, aucune limite de taille. Ce **n'est pas une formule
vendue** : elle n'a pas de prix, elle est absente de `TIER_IDS` donc elle ne
peut jamais apparaître sur la page Tarifs, et `tierOf()` refuse de la
renvoyer — une ligne d'abonnement disant `owner`, quelle qu'en soit l'origine,
n'achète rien. Un paiement qui la nomme est testé et ne la produit pas.

Elle est accordée par `profiles.is_unlimited`, une colonne sur laquelle
`authenticated` n'a aucun droit d'UPDATE ; seuls le rôle serveur et le bouton
« Illimité » de /admin peuvent l'écrire. Sur un déploiement neuf,
`OWNER_EMAILS` la met une fois pour les adresses nommées, exactement comme
`ADMIN_EMAIL` crée le premier administrateur — et la colonne survit à la
variable, qui peut donc être effacée ensuite.

`NO_LIMIT` vaut `Number.MAX_SAFE_INTEGER` et non `Infinity` : ces limites
traversent vers le navigateur en JSON, où `Infinity` devient `null` et
`null > taille` est faux — le compte illimité aurait fini avec la limite la
plus stricte des quatre.

### « J'ai payé » — la file d'approbation

Un client qui envoyait 2 000 FCFA par Mobile Money n'avait aucun moyen de le
dire au site. Il fallait trouver Fortune sur WhatsApp, lui lire une référence
au téléphone, et qu'il la saisisse lui-même dans /admin. Ceux qui
abandonnaient ressemblaient exactement à ceux qui n'avaient jamais payé.

La table `payment_claims` enregistre un paiement déclaré. Trois propriétés :

* **Une déclaration ne donne aucun accès.** Seul un administrateur qui appuie
  sur Approuver déclenche `grantPro`.
* **Le montant ne vient jamais du navigateur.** Le serveur calcule le prix
  avec `planForTier`, la fonction qu'utilise la page Tarifs — « j'ai envoyé
  100 FCFA pour Max » ne peut pas exister.
* **Une référence ne peut être déclarée qu'une fois**, casse et espaces
  compris, via un index unique sur `lower(btrim(transaction_id))`.

L'approbation passe par le même code idempotent que les webhooks : deux
administrateurs qui appuient en même temps donnent un mois à eux deux, pas
deux. Un refus conserve sa raison — c'est ce qui permet à quelqu'un qui a mal
recopié une référence de corriger au lieu d'abandonner.

### Ce que /admin peut faire maintenant

Tous les comptes créés sont listés, avec Pro, Max et Illimité sur chaque
ligne. Pro et Max enregistrent un paiement manuel au vrai prix de la formule
et donnent un mois ; Illimité est le drapeau, sans paiement ni date de fin.
Les paiements à confirmer sont au-dessus de la liste, le plus ancien en tête.

### Ce qui doit être fait en dehors du code

1. Exécuter `supabase/migrations/0003_claims_and_unlimited.sql` dans l'éditeur
   SQL Supabase. Tant que ce n'est pas fait, /admin le dit explicitement au
   lieu d'échouer sur « l'opération a échoué ».
2. Mettre `OWNER_EMAILS=legendfotso@gmail.com` dans Vercel (Config, pas
   Secret), puis redéployer.

## Comment cela a été vérifié

Chaque suite de tests a été lancée sur cette version :

| Suite | Vérifications |
| --- | --- |
| `npm run test:config` | 21 |
| `npm run test:layout` | 18, dont un vrai `unzip -t` sur une archive écrite par le code |
| `npm run test:money` | 39 |
| `npm run test:payments` | 45 |
| `npm run test:tools` | 48, dans un vrai navigateur avec de vrais fichiers |
| `npm run test:db` | 49 garanties sur un vrai PostgreSQL, chaque migration appliquée deux fois |
| `npm run test:access` | 9, dans un vrai navigateur, en visiteur non connecté |

Soit **226 vérifications, toutes réussies**, plus une vérification de types
propre, aucune erreur de lint, une compilation de production réussie, et des
captures d'écran de la page Tarifs à 320 px et 1280 px.

Les nouveaux tests ont été contrôlés en cassant le code exprès : **38 erreurs
volontaires** (dans le calcul des formules, l'écriture du ZIP, le repli
d'avant-migration, l'écart entre prix affiché et prix facturé, l'obligation
de compte, les plafonds du compte illimité et chaque garantie SQL de la file
d'approbation). Deux sont passées au début, chaque fois à cause d'un défaut du test
et non du code : la fausse base de données de la section 3, point 9, et un
test navigateur qui parlait à un serveur resté de l'exécution précédente. Les
deux défauts sont corrigés, et les deux erreurs sont attrapées maintenant.

**Ce que les tests ne couvrent pas :** `/admin` et `/account` exigent une
session connectée et une vraie base de données, donc je n'ai pas vu leurs
nouveaux sélecteurs de formule à l'écran. Ils compilent, passent la
vérification de types et utilisent la même fonction de prix que les tests
couvrent, mais regardez-les vous-même à l'étape 7 ci-dessus.
