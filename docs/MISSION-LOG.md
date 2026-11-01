# Journal de mission VidFetch

Date affichée en Europe/Paris. Les commits de la branche de travail ne deviennent pas publics avant la procédure de revue prévue pour chaque phase.

## 2026-11-01 — Phase 1, convertisseurs locaux

- Reprise sur `feat/local-tools`, commit de synchronisation `b21d2786`; PR #24 est ouverte, en brouillon, et aucun changement n’a été poussé sur `main`.
- Contrôles du commit : CI GitHub verte ([run 41293587862](https://github.com/aouirdani/vidfetch/actions/runs/41293587862)); build OVH et build Next standard, lint, typage, 190 tests unitaires, backend (17), passerelle (3), charge (5), SEO 82 URL, i18n 97 pages, Caddy et conversions passent.
- Émulation ajoutée dans `scripts/local-tools/test-device-profiles.mjs`, résultat `docs/LOCAL-TOOLS-DEVICE-EMULATION.json`: Pixel 7/Chromium à CPU ×4 et 1,6 Mbit/s, iPhone 15/WebKit sans bridage CPU supporté. Les quatre outils produisent des sorties vérifiées par ffprobe; aucune requête externe ni corps média n’est observé.
- Aucun téléphone physique, Safari 26 matériel, Android/Chrome matériel, HEVC/HDR, gestionnaire de téléchargement natif ou applications Photos/Galerie/WhatsApp disponibles. Les plafonds mobiles sont encore des bornes applicatives, pas des garanties de mémoire physique.
- `npm run test:vercel` a été exécuté après le build correspondant : les contrôles de santé/API passent, puis son ancienne fixture attend `/youtube-video-downloader` en 200 alors que YouTube est volontairement verrouillé et la route renvoie 404. Le workflow OVH ne lance pas ce script. Aucun changement YouTube n’a été fait; réparation prévue en phase 5.
- Revue critique pré-fusion : GO sous les contrôles exécutés. Les 32 routes sont au registre/sitemap avec contenu SSR, tests d’indexation par Caddy; les outils s’exécutent uniquement sur fichiers choisis, moteur paresseux, OPFS/file streaming et tests sans corps réseau; pas de changement d’API serveur, des deux moteurs protégés, des pages TikTok ou du comportement YouTube. Diff relu sur limites, codecs, droits, dépendances épinglées/licences, nettoyage OPFS, sitemap/hreflang, erreurs traduites et absence de pages orphelines. Performance de laboratoire reste sous les budgets documentés. Les validations physiques restent humaines, sans bloquer les parcours d’émulation demandés.
- CI finale du commit `eedaadb9` : [run 41295843330](https://github.com/aouirdani/vidfetch/actions/runs/41295843330), tous les jobs réussis. PR #24 `CLEAN`, toujours en brouillon à ce point du journal.
- Exception indépendante de la CI : `npm run test:vercel` échoue sur sa liste historique qui exige YouTube en 200. Réparation prévue en phase 5, sans rendre cette plateforme accessible.
- Décision : préparer la PR #24 à la fusion après cette CI; n’effectuer aucune poussée directe sur `main`. Vérification de la promotion et du statut actif du serveur restent après fusion.
