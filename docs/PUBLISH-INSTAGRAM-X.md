# Publication Instagram / X : décision humaine obligatoire

Les candidats `instagram-video` et `x-video` sont fermés. Ne pas ouvrir une gate à partir d'un simple test de détection d'URL. Les textes préparés ne constituent pas une preuve de capacité. Aucune exécution contre la production n'a été effectuée par l'agent.

## Vérifier ses propres contenus

Installer les dépendances du dépôt, un Chromium Playwright normal (`npx playwright install chromium`) et ffprobe. Utiliser un terminal interactif avec affichage graphique. Créer un fichier texte UTF-8 contenant un lien HTTPS de publication par ligne : Instagram `/reel/` ou `/p/`, X `/status/`. Pas de profil, de query string, de cookie, de mot de passe ou de contenu tiers non autorisé. Le fichier peut contenir des commentaires commençant par `#`.

```sh
node scripts/ovh/verify-platform-links.mjs --links /chemin/liens-autorises.txt --out /chemin/rapport-prive --confirm-rights
```

Le script exige ensuite la saisie exacte `I HAVE PERMISSION`. Il ouvre une fenêtre normale sur `https://vidfetch.app`. Effectuer manuellement la vérification humaine du site lorsque nécessaire. Le script utilise le formulaire et ses API publiques réelles : analyse, choix du format, préparation via la file, ticket et téléchargement. Il ne fabrique pas de grant et n'accède pas au moteur directement. Aucun appel de production n'est effectué par ses imports ou ses tests unitaires.

Le contexte est neuf, sans profil persistant, stockage de session ni cookies de compte. Ne pas se connecter à Instagram ou X. Les accès directs aux domaines des plateformes dans le navigateur sont refusés ; le moteur public existant fait son travail habituel. Une connexion obligatoire, un refus de datacenter ou une restriction de plateforme signifie « non pris en charge ». Interdits : cookies de compte, identifiants, proxy résidentiel, modification d'empreinte ou technique de contournement.

## Budget et résultats

Maximum trois liens par exécution, deux formats par lien, aucune concurrence ni relance automatique. Préférer un à deux liens par jour UTC et tenir compte des autres usages du même navigateur, de l'IP et du réseau. La limite de huit préparations n'est pas un crédit garanti : le registre applique aussi 1 Gio réservé par identité, et une limite réseau partagée de 100 préparations/4 Gio. Avec une réservation de 256 Mio, quatre préparations peuvent déjà épuiser l'enveloppe. Un échec peut conserver sa réservation. Le script s'arrête sur quota, limitation de débit ou capacité insuffisante ; attendre le renouvellement naturel, sans changer d'identité.

Chaque plateforme reçoit un JSON et un Markdown : liens fournis, types, résultats par format, codes normalisés, temps, durée et pistes vérifiées par ffprobe. Les fichiers téléchargés sont temporaires et supprimés après examen. Ne pas versionner les rapports réels. Aucun titre, auteur, cookie, jeton, URL de média signée ou réponse brute n'est enregistré. Le taux porte sur les cas demandés ; les lignes explicitement non tentées après quota sont exclues. Ne pas transformer ce petit échantillon en statistique marketing.

## Seuil recommandé

Pour chaque type réellement annoncé, obtenir **100 % de réussite de bout en bout sur au moins trois publications indépendantes autorisées, sur au moins deux jours UTC**, pour chaque format annoncé. Inclure Reel et publication vidéo séparément pour Instagram, une publication native X, avec et sans son si ce cas doit être décrit. Respecter le budget, donc répartir ces tests sur plusieurs jours. Tester aussi l'échec propre des contenus privés/supprimés sans chercher à y accéder. Une seule réussite n'établit pas une capacité durable. Le seuil protège la précision de la promesse ; il n'est pas une garantie statistique de disponibilité future.

Si un type ou format échoue : laisser fermé ou réduire précisément les types/formats annoncés, puis refaire la campagne. Si la plateforme impose une connexion ou refuse le serveur OVH, garder fermé. Aucun changement des moteurs protégés n'est autorisé dans ce chantier.

## Ajuster les textes avant d'ouvrir les gates

Dans `content/platforms/catalogue.json`, confirmer les types de liens, formats réellement retournés, son absent, comportement des carrousels et alias X/Twitter. Confirmer la configuration publique active (`VIDFETCH_PUBLIC_MAX_MIB`) et les quotas. Les valeurs de base du code sont connues ; la capacité Instagram/X et leur disponibilité depuis OVH restent **à confirmer**. Ne pas présenter stories, lives, comptes privés/protégés ou publications supprimées comme compatibles.

Faire relire les huit langues, en priorité arabe et indonésien. Les dates `updated` et `publishedAt` du candidat datent la rédaction préparatoire ; les remplacer par les dates réelles de validation et de publication du contenu final. Contrôler les questions/réponses et les données structurées ensemble.

Pour la plateforme validée seulement, adapter dans une future PR le texte du formulaire afin de retirer sa mention « sans garantie », avec un module de copie frontend séparé des dictionnaires partagés par la passerelle. Conserver la réserve de l'autre plateforme. Ne pas modifier les bundles protégés ou les textes/contrôles YouTube.

## Publier dans une PR, jamais sur main

Après validation humaine de la campagne, de la copie et de l'autorisation de publication, passer les trois gates à `true` et `published` à `true` pour le seul candidat concerné. Les tests sur fixture prouvent ce fonctionnement sans ouvrir les gates du catalogue réel. Construire, lancer `npm test`, `npm run lint`, `npm run typecheck`, `npm run seo-check`, `npm run test:i18n` et toutes les vérifications CI. Contrôler les huit versions, les hreflang réciproques, canonical, FAQ JSON-LD, navigation et sitemap. Créer une PR, attendre les checks verts et une validation humaine. Ne pas fusionner automatiquement.

Après déploiement approuvé : purger le cache Cloudflare des pages, du sitemap et des accueils concernés ; tester le HTML initial et les en-têtes en direct ; inspection en direct Search Console des versions EN, FR, ID, PT ; soumettre `https://vidfetch.app/sitemap.xml`, puis demander l'indexation des pages réellement ouvertes. En cas de panne durable, fermer publication/gates et supprimer leurs liens plutôt que conserver une promesse non fonctionnelle.
