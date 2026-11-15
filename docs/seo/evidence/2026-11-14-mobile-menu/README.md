# Menu mobile — preuves avant/après

Avant : production `e2a9fe05e90cfe3c521ac89d4fe2bf9dd3540310`, Chrome, viewport 390 × 844. `before.json` conserve la mesure brute ; les deux captures montrent le panneau ancré au bouton. Mesure chargement complet : anglais −173,19 à 82,81 px ; arabe 153,19 à 409,19 px. Les deux dépassent l’écran.

Après : build local de la branche corrective depuis ce même main. `navigation.json` conserve les 16 cas mobiles (`/`, `/fr`, `/ar`, `/blog/why-cant-i-save-tiktok` × 320/360/390/414 px, hauteur 700), les 8 menus ordinateur (Outils/Légal × ces quatre routes à 1280 × 900) et les deux vues 390 × 844. 216 liens ont réellement été cliqués et leurs destinations ont répondu 200. Les ancres de page ont été suivies. Le panneau et les rectangles de texte sont contrôlés, au-delà d’un simple clic partiel.

À 390 px : panneau anglais et arabe de x=12 à x=378. Défilement vertical interne si nécessaire, section À propos/Contact séparée ; captures `*-trust.webp` prises après accès au dernier lien. Focus clavier visible, Échap ferme et rend le focus au bouton. À 320 px, le visuel décoratif de l’accueil est contenu dans son bloc pour ne plus élargir le document. Aucun masquage global du débordement de page.

- [Avant anglais](before-en-390.webp) · [Après anglais](after-en-390.webp) · [Section confiance anglais](after-en-390-trust.webp)
- [Avant arabe](before-ar-390.webp) · [Après arabe](after-ar-390.webp) · [Section confiance arabe](after-ar-390-trust.webp)

Le workflow exécute `npm run test:navigation` comme étape bloquante et conserve le JSON et les captures dans un artefact distinct. Les résultats CI/Lighthouse exacts sont attachés à la PR. Le contrôle public après déploiement sera consigné lors de la mise à jour de #44 depuis main ; cette PR ne modifie pas #44.

## Production — contrôle du 15 novembre 2026

#45 fusionnée et déployée en 4b2bee42a5b999a3eb2ace2b54fcfa492de5dd62. [Navigation publique](production/navigation/navigation.json) : tous les 16 cas mobiles et huit menus ordinateur passent, 216 clics réels. EN et AR à 390 px : x=12 à x=378, document de largeur390. [Après production EN](production/navigation/after-en-390-trust.webp) · [Après production AR](production/navigation/after-ar-390-trust.webp).

[Indexation publique](production/indexing/results.json) : 106URL historiques+48pages de confiance en200 index/follow, canonical/hreflang/sitemap corrects, 34corps de guides conservés, ads.txt et meta AdSense identiques. [Activation](production/deployment.json), [santé publique](production/health.json), [CI PR](production/ci-pr-audit.json), [CI main](production/ci-main-audit.json) : deux bundles intacts ; 24rapports par CI, A11y/BP/SEO100 et CLS0. La fin du texte de préparation ci-dessus est désormais résolue par ces preuves. #44 est synchronisée depuis main uniquement après ce succès et reste non fusionnée.
