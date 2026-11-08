# Pages de confiance et guides — suivi de réalisation

## Périmètre et état

Mission commencée le 07/11/2026, référence publique initiale `7a8da1996057a18c63b27bbe1289555b87ec2b99`, 106 URL indexables. Le 100/100 OpenSEO est un score technique ; les anciens 99–100 Lighthouse OpenSEO sont des mesures ponctuelles et ne sont pas annoncés comme les résultats CI de cette mission.

Trois PR d’implémentation prévues : pages de confiance ; rangs 1–15 du plan ; rangs 16–30 et dix traductions françaises. Les rangs sont figés après la revue du propriétaire ; G17 et G25 ont été corrigés dans le plan inclus. Les résultats de chaque phase seront ajoutés ici après leur vérification.

Une seule question groupée sur l’éditeur, le pays, le droit, le lancement, l’auteur, la relecture et les délais a été posée avant la première PR. Sans réponse à ce stade, les champs sont conservés dans `src/lib/publisher.ts`. **Les 48 nouvelles pages de confiance restent non publiées**, et les nouveaux guides dont la signature est encore un champ resteront eux aussi non publiés. Aucun résultat de publication n’est déduit de l’existence d’un fichier source.

## Pages préparées — URL proposées, actuellement non publiées

`content/trust-pages.json` contient six pages dans chaque langue. `availableTrustPages` exclut les champs visibles non résolus avant la résolution des routes, le menu, le pied de page et le sitemap. Les pages exclues répondent donc 404/noindex ; ce ne sont pas des pages publiques « à compléter ». Les liens de confiance apparaîtront seulement quand leurs cibles sont publiables. `/legal` et ses sept équivalents restent en 200, indexables, avec leurs URL et licences inchangées ; leurs titres deviennent « Informations légales » dans chaque langue et leur résumé de confidentialité est rapproché du code réel.

| Langue | À propos | Contact | Confidentialité | Conditions | Droits d’auteur | Éditorial |
| --- | --- | --- | --- | --- | --- | --- |
| en | `/about` | `/contact` | `/privacy` | `/terms` | `/copyright` | `/editorial-policy` |
| fr | `/fr/a-propos` | `/fr/contact` | `/fr/confidentialite` | `/fr/conditions-utilisation` | `/fr/droits-auteur` | `/fr/politique-editoriale` |
| es | `/es/acerca-de` | `/es/contacto` | `/es/privacidad` | `/es/condiciones-uso` | `/es/derechos-autor` | `/es/politica-editorial` |
| pt-BR (`/pt`) | `/pt/sobre` | `/pt/contato` | `/pt/privacidade` | `/pt/termos-de-uso` | `/pt/direitos-autorais` | `/pt/politica-editorial` |
| id | `/id/tentang` | `/id/kontak` | `/id/privasi` | `/id/ketentuan-penggunaan` | `/id/hak-cipta` | `/id/kebijakan-editorial` |
| de | `/de/ueber-uns` | `/de/kontakt` | `/de/datenschutz` | `/de/nutzungsbedingungen` | `/de/urheberrecht` | `/de/redaktionsrichtlinie` |
| it | `/it/chi-siamo` | `/it/contatti` | `/it/privacy` | `/it/condizioni-uso` | `/it/diritto-autore` | `/it/politica-editoriale` |
| ar | `/ar/من-نحن` | `/ar/اتصل-بنا` | `/ar/الخصوصية` | `/ar/شروط-الاستخدام` | `/ar/حقوق-النشر` | `/ar/السياسة-التحريرية` |

À propos nécessite nom, pays et lancement ; Contact nécessite le délai de réponse ; Confidentialité nécessite nom, pays et durée des journaux d’infrastructure ; Conditions nécessite nom et droit applicable ; Droits d’auteur nécessite le délai de traitement ; Éditorial nécessite auteur et statut réel de relecture. Toutes ces valeurs restent explicitement à compléter, sans nom, pays ou relecture inventés. La durée des journaux est un champ opérationnel supplémentaire : l’exemple `MaxRetentionSec=14day` n’a pas été traité comme une configuration active.

Le rendu publié est prévu avec AboutPage/ContactPage/WebPage, BreadcrumbList, canonical, hreflang réciproques et date visible. Le fonctionnement structurel est testé ; les pages incomplètes ne sont pas exposées dans le seul but d’obtenir un résultat 200.

## Confidentialité — correspondance de chaque affirmation avec le code

| Affirmation du contenu | Fichier ou fonction qui la justifie | Limite de la preuve |
| --- | --- | --- |
| Adresse légale, vie privée et abus en `@vidfetch.app` | `src/lib/contact.ts`, `withOfficialContacts` | Adresses déjà publiées ; livraison d’un email non testée, aucun délai inventé. |
| Exclusion de l’obfuscation Cloudflare | `src/components/AbuseLink.tsx`, `ContactText` | Encadrement `email_off` et échappement HTML ; contrôle HTTP public à refaire après déploiement. |
| Lien TikTok et format transmis au serveur et à la source | `src/lib/secure-client.ts`, `backend/gateway/server.ts`, `backend/server.ts:mediaInfo`, `src/lib/engine.ts:dumpJson` | Parcours serveur, distinct du choix d’un fichier local. |
| Fichiers locaux jamais envoyés pour conversion | `src/local-tools/engine.worker.mjs`, `src/components/LocalMediaTool.tsx`, `scripts/local-tools/test.mjs` | BlobSource, worker et sorties locales ; les fichiers du moteur sont, eux, téléchargés. |
| Aucun compte utilisateur ou profil public requis | `src/server/download-access.ts`, `src/lib/secure-client.ts` | Identité de sécurité éphémère ; ne pas confondre absence de compte et absence de cookies. |
| Cookie d’autorisation 30 min, Secure/HttpOnly/Strict | `src/server/download-access.ts:createAccessIssuer` | `sessionExpiry = sessionIssued + 1800`, renouvellement sans prolongation infinie de la session existante. |
| Cookie de transfert et ticket court | `backend/gateway/server.ts` | `__Secure-vidfetch-transfer`, Max-Age lié au ticket, valeur par défaut ticket 55 s. |
| IP reçue et identifiant dérivé pour quotas | `src/server/download-access.ts`, `backend/gateway/server.ts:alias` | Les infrastructures voient l’IP réseau ; ne pas qualifier toute l’opération d’anonyme. |
| Base quotas sans IP brute, URL, titre ou cookie | `backend/gateway/ledger.ts` | Tables counters/proofs, identifiants dérivés ; aucune conclusion sur les journaux externes. |
| Clés navigateur et autorisations API en mémoire | `src/lib/secure-client.ts` | Champs privés pair/access, pas de persistance de ces champs dans localStorage. |
| Compteurs à échéance fin de jour UTC puis nettoyage | `backend/gateway/ledger.ts:reserve`, `prune` | Suppression au prochain nettoyage, pas une promesse d’effacement physique à la seconde de minuit ni de durée des sauvegardes. |
| Preuves anti-rejeu 90 s | `backend/gateway/ledger.ts:useProof` | Marquées expirées puis supprimées par prune. |
| États de transfert 30 min et nettoyage | `backend/gateway/server.ts`, `backend/server.ts:prune` | Valeurs par défaut ; les entrées expirées sont nettoyées, les journaux d’hébergement sont distincts. |
| Pas de bibliothèque vidéo permanente | `backend/server.ts:dispose`, flux de transfert et arrêt des processus | Ne signifie pas absence de tout traitement ou buffer temporaire serveur. |
| Sorties OPFS temporaires et copie téléchargée distincte | `src/local-tools/opfs.mjs`, `engine.worker.mjs`, `download.worker.mjs` | Effacement sur fin/annulation/abandon et nettoyage lors d’une visite ultérieure ; un navigateur fermé peut conserver un résidu jusqu’au nettoyage. |
| Worker de téléchargement à portée limitée et cache du moteur | `src/local-tools/download-client.ts`, `public/local-media/download/`, `scripts/local-tools/build.mjs` | Pas de promesse que le navigateur efface immédiatement ses caches ; contrôle de portée dans les tests. |
| Cloudflare et Turnstile participent au réseau | `deploy/ovh/Caddyfile`, `src/server/turnstile.ts`, composant de vérification du téléchargement | La fonction serveur ne journalise pas le secret ou le token ; la rétention du fournisseur n’est pas déduite de ce code. |
| Journaux d’accès désactivés et champs sensibles filtrés dans la config versionnée | `deploy/ovh/Caddyfile` | Pas d’accès administrateur à la configuration active dans cette mission ; durée d’infrastructure laissée à compléter. |
| Aucune publicité active | `src/lib/adsense.ts`, layout du site et tests AdSense | `ADSENSE_DEFERRED_LOADING_ENABLED=false` inchangé ; ni `ads.txt` ni métadonnée du compte modifiés. |
| CMP préparée mais inactive | `src/lib/consent.ts`, `ConsentManager.tsx` | Faux par défaut, aucune source de message configurée, aucune requête CMP ; aucune publication de message dans le compte Google. |
| Droits RGPD et contact pour leur exercice | [Commission européenne — demandes des personnes](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en), consulté le 07/11/2026 ; `src/lib/contact.ts` | Présentés lorsque le RGPD s’applique ; aucune nationalité ou base juridique de l’éditeur inventée. |

## CMP et éléments AdSense protégés

Voir [CMP-ACTIVATION.md](CMP-ACTIVATION.md). La préparation utilise Google Privacy & messaging, dont le message et l’URL réels devront être publiés/configurés par le propriétaire. La constante CMP reste false ; aucune bannière maison n’est qualifiée de certifiée. Les annonces restent inactives. L’activation future doit tester EEE, Royaume-Uni, Suisse et le refus avant la première requête publicitaire.

## Parité des bundles protégés

Référence : archive du run main `42362083325`, release `7a8da1996057a18c63b27bbe1289555b87ec2b99`. Les bundles reconstruits localement pour PR 1 ont les mêmes SHA-256 :

| Bundle | SHA-256 de production et reconstruction locale |
| --- | --- |
| `backend/vidfetch-ovh.cjs` | `fa0d3d4e15a5a45ca0deb2b35e7ba03adc95c31b87500378068121f291c42287` |
| `backend/vidfetch-gateway.cjs` | `0fa1404530c272b76aaec9aee18125660e8561c744e4ccc1fbb9c7dbee9850e5` |

Les archives CI seront comparées à nouveau avant chaque fusion. Aucun changement dans `src/i18n/messages`, le garde ENGINE_FILES, les moteurs ou la passerelle. Les nouvelles chaînes de page sont dans `content/trust-pages.json` et les libellés hors des dictionnaires partagés.

## Validation de PR 1 — en cours

- Lint et typage locaux passent ; quatre tests spécifiques vérifient le verrou de publication, les 48 structures localisées et l’inactivité/refus de configuration CMP.
- Build OVH local Webpack réussi. Le lien local de dépendances entraîne un avertissement de tracing standalone sur macOS ; la CI Linux installe ses dépendances dans son propre checkout et produit l’archive de déploiement.
- `seo-check` vérifie 106 URL, sans orphelines, canonical/hreflang/OG cohérents et aucun champ à compléter visible. Le contrôle est étendu aux descriptions uniques, aux sources de guides et aux champs visibles.
- test:i18n passe sur 106 pages et huit langues, avec transferts simulés. Lighthouse local accueil, trois passes : performance 94/98/97, médiane 97 ; A11y/BP/SEO100 et CLS0. La première passe isolée à 94 est conservée, sans la présenter comme un résultat passant. La CI doit encore valider les six routes sous le garde strict P95. Tests complets, CI, revue de l’archive et production : résultats à compléter après exécution. Aucun succès CI ou déploiement n’est anticipé ici.

## Guides, traductions et indexation

À ce stade : **aucun nouveau guide publié**, aucun nouveau guide rédigé dans PR 1, aucune traduction publiée, aucun sujet fusionné après démonstration. Le plan révisé précise les trente sujets, leur ordre et les dix traductions imposées. Les expériences réelles, captures et inventaires de mots/sources seront ajoutés dans PR 2 et PR 3.

URL nouvelles à soumettre à Google : **aucune pour le moment**. Ne pas soumettre les pages non publiées ; aucune soumission automatique ou manuelle n’a été faite. Un ordre par lots de dix au maximum sera proposé seulement pour des URL effectivement publiées et vérifiées.

## Coût OpenSEO

| Étape | Budget global autorisé | Dry-runs | Coût réel |
| --- | --- | --- | --- |
| Plan initial PR #40, historique | 1,50 USD | Avant chaque appel | 0,51 USD |
| Remplacement G25, US/en, 13 formulations | 0,50 USD | 0 USD | 0,04 USD |
| Dix traductions, France/fr, 24 + 17 formulations | 0,50 USD | 0 USD | 0,08 USD |
| Crawls gratuits après les trois fusions | Sans rendu ni proxy | À vérifier à chaque crawl | Pas encore lancés |
| **Mission actuelle hors plan historique** | **0,50 + 0,50 USD** | **0 USD** | **0,12 USD** |

Les budgets sont par étape complète, pas répétés à chaque appel. Aucun appel payant supplémentaire n’est nécessaire pour les chiffres retenus. Les crawls de suivi utiliseront `render_mode=off`, `use_fallback=false` et seront consignés après leur achèvement.

### Correction Lighthouse avant fusion de la PR 1

Le run 42377588512 a validé les tests, les contrôles de release, seo-check et test:i18n, puis échoué sur les médianes P94 (FR/ID) et P93 (AR). Les autres catégories sont à 100 et CLS à 0. Le nouveau commit transmet seulement les 62 libellés nécessaires aux composants interactifs (159 auparavant), conserve le texte complet des pages sur le serveur et diffère la mise en page du pied de page hors écran. Aucun seuil n’est abaissé, aucun job relancé à l’identique. Les ajustements de types ne changent pas les bundles backend ; leurs SHA-256 reconstruits restent ceux consignés ci-dessus. Résultat du nouveau run à consigner après exécution.

Le run42409386772 a de nouveau validé les contrôles fonctionnels/SEO/i18n mais échoué sur P94 EN/AR (les quatre autres routes P95). Correction suivante : liens HTML natifs dans l’en-tête/pied de page et suppression des préchargements automatiques de contenu. Cela réduit le nombre de composants de navigation hydratés et les requêtes RSC spéculatives. Test local Lighthouse12.6.1 AR :98/100/100/100, CLS0, zéro préchargement RSC ; ce résultat webpack ne remplace pas le contrôle Turbopack Linux du nouveau commit. Aucun déploiement ni retour arrière à ce stade.

### Séparation des modules vérifiée sur Linux

Le run42418980472 n’a pas permis la fusion : EN94, FR93, ID92, audio94, AR93 en médiane ; aucun déploiement. L’analyse a identifié du code des outils locaux dans le JavaScript initial de l’accueil. La [documentation Next.js sur le chargement différé](https://nextjs.org/docs/app/guides/lazy-loading) explique que l’import dynamique depuis un composant serveur ne fournit pas cette séparation automatique. Les nouvelles frontières client gardent le rendu serveur et séparent les composants interactifs. L’analyse Tailwind est limitée au frontend ([documentation des sources](https://tailwindcss.com/docs/detecting-classes-in-source-files)) ; CSS local63758→61279octets.

Reproduction sous Linux avec Node22.23.3, dépendances du package-lock et Turbopack : Lighthouse12.6.1 donne AR100/100/100/100 (LCP1,424s) et outil audio99/100/100/100 (LCP2,134s), CLS0 dans les deux cas. Ce sont deux mesures locales du build Linux, pas le résultat de la CI à venir. seo-check passe sur les106URL et test:i18n vérifie les huit langues, les transferts et les limites API sur ce même build. Le sélecteur de fichiers figure encore dans le HTML sans JavaScript. L’option de test `VIDFETCH_I18N_BASE_URL` accepte uniquement une origine HTTP de boucle locale pour reproduire ce contrôle sans démarrer un second serveur.

La date générale de /legal et le lastmod des pages de confiance utilisent leur révision du7novembre, indépendamment de la date des licences logicielles. Le lastmod du blog repose sur les guides publiés admissibles, pas sur les brouillons.

### HTML et initialisation — 8 novembre

Le run42526535827 passe les contrôles fonctionnels, SEO et i18n, mais Lighthouse reste à92–94en médiane. Aucune fusion ni activation. Les frontières Suspense ajoutées sont retirées : un contrôle supplémentaire a détecté que la FAQ pouvait rester masquée sans JavaScript. Le smoke test vérifie désormais la visibilité réelle du H1 et de la FAQ.

Le fournisseur i18n est limité au formulaire de téléchargement et ses résultats via FetchFormSection ; les vues statiques, outils locaux et navigation ne reçoivent plus ce contexte. La CSS est une feuille externe partagée plutôt qu’une copie dans le HTML et une seconde dans le flux RSC. Mesures du même build Linux : HTML décompressé AR220430→94820octets, audio192768→67158, guide188028→62418. Dix pages sans JavaScript (FAQ comprise) et trois parcours interactifs passent, sans erreur de rendu ni débordement mobile. Lint, typage et16tests ciblés passent. La comparaison Webpack reste une expérience locale ; le compilateur de production reste Turbopack. Aucun réglage d’audit ni seuil modifié. OpenSEO whoami/list_projects revalidés gratuitement ; les crawls de suivi attendent les déploiements effectifs.

### 8 novembre 2026 — Comparaison du compilateur

Le run 42532490308 passe les tests, le smoke SSR, Caddy, les 106 URL SEO et les huit langues/404. Les médianes Lighthouse sont EN 96, FR 95, ID 94, audio 96, guide 97, AR 94 ; A11y/BP/SEO 100 et CLS 0. Les deux routes à 94 bloquent la fusion ; aucun déploiement.

Le build utilise maintenant le [mode Webpack officiellement supporté par Next.js](https://nextjs.org/docs/app/getting-started/installation), sans changer la version de Next ni les seuils. Sur le build Linux avec CSS partagée : dix pages SSR/FAQ sans JavaScript, trois parcours interactifs et huit 404 localisées passent. Lighthouse local AR : 99/100/100/100, LCP 2,204 s, TBT 30 ms, CLS 0. Ce résultat local ne remplace pas la CI à venir. Les deux bundles backend reconstruits conservent exactement leurs SHA-256 de production respectifs. Aucun changement de dépendance ou de fichier de verrouillage.
