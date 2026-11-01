# Journal de mission VidFetch

Date affichée en Europe/Paris. Les commits de la branche de travail ne deviennent pas publics avant la procédure de revue prévue pour chaque phase.

## 2026-11-01 — Phase 1, convertisseurs locaux

- Reprise sur `feat/local-tools`, commit de synchronisation `b21d2786`; PR #24 est ouverte, en brouillon, et aucun changement n’a été poussé sur `main`.
- Contrôles du commit : CI GitHub verte ([run 41293587862](https://github.com/aouirdani/vidfetch/actions/runs/41293587862)); build OVH et build Next standard, lint, typage, 190 tests unitaires, backend (17), passerelle (3), charge (5), SEO 82 URL, i18n 97 pages, Caddy et conversions passent.
- Émulation ajoutée dans `scripts/local-tools/test-device-profiles.mjs`, résultat `docs/LOCAL-TOOLS-DEVICE-EMULATION.json`: Pixel 7/Chromium à CPU ×4 et 1,6 Mbit/s, iPhone 15/WebKit sans bridage CPU supporté. Les quatre outils produisent des sorties vérifiées par ffprobe; aucune requête externe ni corps média n’est observé.
- Aucun téléphone physique, Safari 26 matériel, Android/Chrome matériel, HEVC/HDR, gestionnaire de téléchargement natif ou applications Photos/Galerie/WhatsApp disponibles. Les plafonds mobiles sont encore des bornes applicatives, pas des garanties de mémoire physique.
- `npm run test:vercel` a été exécuté après le build correspondant : les contrôles de santé/API passent, puis son ancienne fixture attend `/youtube-video-downloader` en 200 alors que YouTube est volontairement verrouillé et la route renvoie 404. Le workflow OVH ne lance pas ce script. Aucun changement YouTube n’a été fait; réparation prévue en phase 5.
- Décision : revue critique du diff PR #24 requise avant de la marquer prête et de fusionner; la vérification physique n’étant pas disponible, conserver les plafonds et l’avertissement de limite décrits dans le rapport.
