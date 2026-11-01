# Revue UI/UX — phase 3

## Architecture examinée

VidFetch utilise Next.js App Router avec les routes publiques rendues en HTML statique et une interface d'extraction hydratée par React. Les vues de contenu sont dans `src/views/SiteViews.tsx`; le formulaire, dans `src/components/FetchForm.tsx`; l'en-tête partagé, dans `src/components/Header.tsx`; les styles utilisent Tailwind CSS 4 et quelques règles globales dans `src/app/globals.css`. Les pages d'outils locaux rendent aussi le sélecteur de fichier au-dessus de leur contenu.

## Audit et changement

Le formulaire principal était déjà visible dans le HTML initial, utilisable au clavier, doté d'un champ URL qui détecte TikTok pendant la saisie, d'un bouton de collage qui lance l'extraction quand le presse-papiers contient un lien reconnu, d'un état d'attente, de messages d'erreur et d'un sélecteur de formats. Les animations respectent `prefers-reduced-motion`, les erreurs sont affichées en ligne, les liens de démonstration ne lancent aucun téléchargement et les protections du formulaire excluent YouTube.

Le défaut mobile trouvé était la disparition sous 1024 px des liens de navigation principale, y compris les deux pages TikTok localisées. L'en-tête affichait directement les outils locaux, mais ne rendait pas visibles les pages plateforme. L'en-tête mobile possède maintenant un menu natif repliable qui liste les outils TikTok publiés dans la langue courante, les quatre convertisseurs locaux, les ancres de fonctionnement/FAQ et les guides disponibles. Les libellés sont localisés dans les huit dictionnaires. Le menu natif évite une nouvelle dépendance ou un bundle d'interaction supplémentaire.

## Comparaison des parcours publics

- [SnapTik](https://snaptik.app/en3) expose le champ de lien dès le premier écran, puis décrit copier → coller → télécharger. Il met aussi en avant des affirmations de retrait de filigrane et d'absence de limites; VidFetch ne les reprend pas, car elles ne correspondent pas à son produit.
- [SSSTik](https://ssstik.io/) expose également le champ et un bouton de collage au premier écran et explique un parcours en trois étapes. Sa page promet « illimité » et le retrait de filigrane; ces promesses ne sont pas reprises.
- [SaveFrom](https://en.savefrom.net/) n'a pas pu être inspecté par le navigateur de recherche dans cet environnement; aucune comparaison fonctionnelle n'en est tirée.

VidFetch demande de copier le lien, puis de le coller (ou d'utiliser le bouton Presse-papiers qui démarre l'extraction), de choisir un format et de télécharger. L'écran de formats rend ce choix explicite. Le parcours n'a pas été raccourci en déclenchant une requête au simple changement du champ; l'intention de l'utilisateur reste explicite.

## Captures et vérifications

Les captures Chromium locales avant/après sont dans `before/` et `after/` : accueil, page TikTok et compresseur aux dimensions 390×844, 768×1024 et 1440×900. Les menus mobiles ouverts sont aussi capturés en EN, FR, AR et ID; les autres captures montrent formats, téléchargement, file et quota dans ces langues. Le test Playwright `npm run test:i18n` vérifie les 97 pages SSR, les liens de langue, le rendu RTL, les sélecteurs de formats, et le parcours de téléchargement avec une vidéo MP4 et une piste MP3 synthétiques produites localement par FFmpeg. Les réponses API restent des fixtures; aucun média n'est demandé à TikTok.

Les captures ne représentent pas un appareil physique. Lighthouse n'est pas installé. Pour comparer malgré cela, trois navigations Chromium ont été faites sur le commit de base et trois sur la version modifiée, avec viewport 390×844, CPU ×4, réseau simulé à 200 kbit/s et 150 ms de latence; les scripts HTTPS tiers étaient bloqués. Les valeurs sont des médianes locales, pas des scores Lighthouse ni une mesure terrain. Le TBT est estimé par les tâches longues observées moins 50 ms.

| Page | LCP avant → après | CLS avant → après | TBT estimé avant → après | JS transféré avant → après |
|---|---:|---:|---:|---:|
| Accueil EN | 336 → 332 ms (-1,2 %) | 0 → 0 | 64 → 59 ms (-7,8 %) | 159 678 → 159 685 B (+0,004 %) |
| TikTok EN | 332 → 328 ms (-1,2 %) | 0 → 0 | 58 → 58 ms (0 %) | 159 678 → 159 685 B (+0,004 %) |
| Compresser EN | 312 → 304 ms (-2,6 %) | 0 → 0 | 58 → 40 ms (-31 %) | 159 678 → 159 685 B (+0,004 %) |
| Article EN | 288 → 312 ms (+8,3 %) | 0 → 0 | 55 → 43 ms (-21,8 %) | 159 678 → 159 685 B (+0,004 %) |

Aucun indicateur observé ne dépasse +10 %. La variation LCP de l'article est sous le seuil et n'est pas attribuée au menu qui n'ajoute que sept octets de JavaScript; l'échantillon est trop petit pour établir une causalité. Aucun téléphone physique n'est accessible.
