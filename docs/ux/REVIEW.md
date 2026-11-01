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

Les captures ne représentent pas un appareil physique. Pas de score Lighthouse fiable enregistré ici : aucun binaire Lighthouse autonome n'est installé/configuré dans le dépôt. La modification ne rajoute ni script client ni dépendance et ne touche pas aux médias/ressources LCP; la mesure de performance réelle sur mobile reste à confirmer après fusion si le propriétaire souhaite un score de référence.
