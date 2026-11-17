# Livrer et revenir à la version précédente

Sur le Mac, utiliser Node 22 : `npm run preflight`, puis commit et `git push origin main`. Le preflight reconstruit le frontend et un instantané frais de vidfetch.app, vérifie toutes les URL et les champs SEO, robots.txt et ads.txt octet pour octet, le périmètre AdSense existant, les deux moteurs et les tests concernés. Objectif : quatre minutes ; aucun contrôle ne peut être ignoré.

Le push main lance uniquement **Production directe** : cache npm/Next, un build Linux, vérification des moteurs et de l’archive, contrôle SEO sans navigateur, activation existante puis contrôle public des154 pages, de la404 et des trois fichiers publics. Une erreur publique déclenche automatiquement le retour à la version précédente et laisse le workflow en échec. Le retour automatique refuse d’écraser une release plus récente. Les moteurs, la passerelle, Caddy et les secrets ne sont ni remplacés ni redémarrés.

Pendant l’examen AdSense, la liste figée `tests/fixtures/adsense-production-20261117.json` conserve exactement114 URL avec la balise (dont les huit accueils) et40 sans balise (32 outils locaux et huit pages légales). Tout gain ou retrait échoue, y compris au contrôle public après activation. La404 reste sans balise et aucun script publicitaire n’est autorisé ; ads.txt reste identique octet pour octet. L’instantané SEO frais ne peut pas réapprouver une modification de ce périmètre.

L’audit attend une santé prête sur la release attendue, puis contrôle12 URL en parallèle (réglable de8 à16), avec30s par requête et une limite globale ferme de120s. Il ne répète pas les pages en échec. Les erreurs nomment l’URL et la phase ; les durées de réponse, médiane, p95 et maximum sont journalisées, sans URL média ni secret. `--timings build/audit-http.json` conserve les mesures de chaque requête. Tous les critères de contenu, d’indexation et AdSense restent identiques.

Sur le serveur, une commande administrateur restaure la version précédente et valide sa santé et son origine HTTPS :

```sh
sudo /usr/local/libexec/vidfetch-ci/rollback.py
```

Objectif : moins d’une minute. La version quittée devient la précédente : relancer la même commande permet d’y revenir. Les transactions interrompues sont récupérées avant toute nouvelle activation. Aucun fichier de release n’est supprimé. Vérifier `https://vidfetch.app/api/health` et les pages du site après la commande.

**Contrôles complets** tourne à 03 h à Paris (heure d’été/hiver prise en compte), et à la demande depuis Actions. Ses jobs sont parallèles et disposent de caches npm, Next, Playwright et paquets FFmpeg. Il n’est pas lié au déploiement ; les échecs ouvrent ou mettent à jour une seule issue « Contrôles complets en échec », close au rétablissement. Lighthouse conserve A11y/BP/SEO=100 et CLS≤0,02 dans ce workflow ; Performance/LCP/TBT restent des avertissements.

Installation initiale de l’extension de retour arrière : les trois fichiers `deploy/ovh/ci/{promote,dispatch,rollback}.py` doivent être installés par l’administrateur, propriétaires root et mode 0755, sous `/usr/local/libexec/vidfetch-ci/`, après sauvegarde des fichiers existants. Le compte CI conserve son unique helper sudo et son SSH forcé ; aucun accès shell supplémentaire. Ne jamais pousser la migration de workflow avant cette installation et les tests des protections.
