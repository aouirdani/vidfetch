# Accueil — le lien devient le point d’entrée principal

Branche créée depuis main c6deea404de094048c8b081d9c7709ac01636dc3. La maquette Claude n’était pas accessible ; la description détaillée de l’éditeur fait référence. Framework, polices, couleurs et parcours après analyse conservés ; aucun nouveau paquet installé.

## Captures réelles

| Vue | Avant en production | Après, build local |
|---|---|---|
| FR ordinateur1440 × 900 | [avant](before-fr-1440.webp) | [après](after-fr-1440.webp) |
| FR mobile390 × 844 | [avant](before-fr-390.webp) | [après](after-fr-390.webp) |
| AR ordinateur1440 × 900 | [avant](before-ar-1440.webp) | [après](after-ar-1440.webp) |
| AR mobile390 × 844 | [avant](before-ar-390.webp) | [après](after-ar-390.webp) |

## Périmètre

Héros sur une colonne, H1 et introduction conservés mot pour mot ; retrait de HeroScene sur l’accueil et les pages TikTok. Le groupe de saisie (URL, Coller et Télécharger) mesure800 px sur ordinateur, avec une hauteur de saisie60 px ; bouton60 px, bordure2 px et socle jaune14 px (9 px mobile). Sur mobile le bouton occupe la deuxième ligne. Les badges décoratifs sont masqués. Une animation transform de0,9 s, une seule fois, désactivée en mouvement réduit ; aucune modification d’hydratation.

Un message aria-live de hauteur fixe remplace les anciens blocs dispersés. Télécharger reste bleu et actif à vide ; validation, focus et erreurs localisées. Coller remplit le champ et le remet au focus, sans lancer une extraction. Les exemples restent du texte, sans boutons lançant une vidéo tierce. Les contrôles de format, de résultat et de téléchargement sont inchangés.

Les trois pastilles sont justifiées par le code : accès public gratuit avec limites existantes, traitement dans le navigateur sans application VidFetch à installer, autorisation anonyme via DownloadAccess sans inscription. Aucun compte utilisateur n’est demandé. La mention de droits d’origine est conservée. Les nouveaux textes restent dans des modules frontend et sont traduits dans les huit langues ; aucun dictionnaire embarqué dans la passerelle modifié.

En-tête : liens courts vers les deux URL TikTok existantes, Outils vidéo, Guides et langue. Les liens de téléchargement, étapes, FAQ, À propos et Contact retirés du premier niveau sont déplacés dans Outils ; tous les liens mobiles et du footer restent présents. Les étapes sont regroupées dans l’unique section #how-it-works. Le JSON-LD HowTo conserve son contrat existant, comme toutes les autres données structurées.

## Vérification

- [Contrat figé des154 pages](../../../tests/fixtures/home-ui-preservation.json) capturé depuis la production c6deea4 : H1, title, description, canonical, hreflang, données structurées, AdSense et comptes de liens par page/destination. Capture protégée contre l’écrasement ; aucune actualisation automatique de la référence.
- [Préservation locale](preservation.json) :154 pages identiques pour tous ces champs, aucun lien interne perdu ni page orpheline, sitemap et ads.txt identiques. Le contrôle est ajouté à seo-check.
- [Mesures et interactions](home-ui.json) :25 cas au-dessus de la ligne de flottaison (1280×720,1366×768,1440 × 900,390 × 844,360×740 sur /,/fr,/ar,/de et /fr/telecharger-video-tiktok),56 cas de débordement/en-tête dans8 langues ; contraste, Tab→champ→Coller→Télécharger, Entrée, états du message, collage sans requête et mouvement réduit.
- [i18n et parcours après analyse](local-i18n.json) :154 pages,8 langues,16 transferts et quotas des pages TikTok,8 transferts d’accueil, RTL et YouTube sans requête. Médias locaux générés avec FFmpeg, admission simulée et helper crypto réel ; aucune vidéo tierce réellement téléchargée.
-211 tests Node réussis ; lint, typage et build OVH réussis. Le test de quota attend désormais son message inchangé dans la zone aria-live unique, au lieu de l’ancien bloc alert ; les vérifications d’erreur et de transfert restent exécutées.

## Lighthouse et garde de publication

[Référence LCP](baseline-lighthouse.json) :24 rapports de la dernière CI main 43729761854, trois par route. Le workflow conserve les seuils A11y/BP/SEO 100 et CLS ≤ 0,02 bloquants, Performance/LCP/TBT warn. Une comparaison des médianes LCP par route est produite dans l’artefact Lighthouse. Avant fusion, la revue doit lire noLcpRegression et retenir la publication si une médiane recule par rapport à cette référence ; aucun «Re-run all jobs» pour améliorer une mesure. Résultats CI exacts à consigner dans la PR après son exécution.

AdSense, ads.txt, ADSENSE_DEFERRED_LOADING_ENABLED=false, ENGINE_FILES, Caddy et moteurs inchangés. Les deux SHA-256 de bundles de l’archive CI restent à comparer avant fusion avec leurs références respectives : OVH fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287 ; gateway 0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5. Aucun guide publié ou approuvé, aucune soumission Google, aucun appel OpenSEO.
