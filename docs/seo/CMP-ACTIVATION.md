# CMP préparée, désactivée

État livré : `CONSENT_CMP_ENABLED=false`, `GOOGLE_CMP_MESSAGE_SRC=null` dans `src/lib/consent.ts`. `ConsentManager` ne produit aucun script ni requête dans cet état. `ADSENSE_DEFERRED_LOADING_ENABLED` reste **false**, `ads.txt` et la métadonnée du compte ne changent pas.

Solution retenue pour préparation : **Google Privacy & messaging**, CMP de Google pour ses messages « European regulations ». Il s’agit du dialogue opéré par Google, pas d’une bannière maison déclarée certifiée. Sources consultées le 07/11/2026 : [exigence de CMP certifiée](https://support.google.com/adsense/answer/13554116?hl=en), [messages européens](https://support.google.com/adsense/answer/10961068?hl=en), [fonctionnement de la CMP Google](https://support.google.com/adsense/answer/16918505?hl=en).

## Activation ultérieure avec les annonces

1. Confirmer l’approbation du compte, les informations de l’éditeur, la politique de confidentialité publiée et les traitements publicitaires réellement envisagés. Ne pas utiliser les champs à compléter comme mentions finales.
2. Dans le compte AdSense du propriétaire, créer/publier le message européen Google Privacy & messaging pour vidfetch.app, ciblant EEE, Royaume-Uni et Suisse. Configurer les partenaires réellement utilisés, les choix de refus et de gestion du consentement. Vérifier à nouveau la certification et les exigences TCF alors en vigueur.
3. Copier **l’URL exacte du script d’intégration fournie par Google** dans `GOOGLE_CMP_MESSAGE_SRC`. Aucune URL de message ou identité CMP n’est inventée dans ce dépôt. Le code accepte uniquement HTTPS sur `fundingchoicesmessages.google.com/i/` et refuse une activation sans source.
4. Préparer ensemble l’activation de `CONSENT_CMP_ENABLED` et des annonces dans une nouvelle revue. Le présent travail ne modifie pas le chargeur d’annonces et ne donne pas l’autorisation de l’activer. Ne pas activer le seul drapeau publicitaire sans CMP et sans tests TCF ; vérifier que le mécanisme d’annonce respecte les choix de consentement avant sa première requête. Évaluer le cas hors région et le refus selon les réglages réels du compte.
5. Tester un nouveau profil en EEE, Royaume-Uni et Suisse : affichage avant toute annonce, acceptation, refus, absence de choix, retour et changement d’avis, clavier et lecteur d’écran. Contrôler le réseau, les cookies et les signaux `__tcfapi` ; aucun test géographique ou compte réel de ce type n’a été effectué ici.
6. Relancer Lighthouse, les contrôles des huit langues et les contrôles des pages locales sans envoi de fichier. Mettre à jour la politique et le rapport avec les partenaires, cookies et durées effectivement constatés avant déploiement publicitaire.

Une constante et une source de message ne constituent pas une configuration de consentement complète. Le compte AdSense et la publication du message restent sous le contrôle du propriétaire. Aucun message n’a été créé dans son compte par cette mission.
