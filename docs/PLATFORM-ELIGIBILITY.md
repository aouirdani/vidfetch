# Vérification préalable des plateformes — vague 2

Revue documentaire du 1er novembre 2026. Ce relevé de conditions d’utilisation est un inventaire produit, pas un avis juridique. Aucun accès de test ni téléchargement n’a été réalisé.

| Plateforme | Ce que disent les sources officielles | Conséquence pour VidFetch |
|---|---|---|
| Facebook / Meta | Meta décrit l’extraction automatisée sans permission comme une collecte non autorisée et indique qu’elle viole ses conditions. [Meta, How We Combat Scraping](https://about.fb.com/news/2021/04/how-we-combat-scraping/). | Ne pas activer de récupération automatisée à partir des pages publiques sans autorisation écrite Meta ou interface explicitement autorisée. La visibilité publique d’une publication ne constitue pas cette autorisation. |
| Reddit | Le User Agreement interdit l’accès, la recherche ou la collecte automatisée hors des méthodes permises par les conditions ou un accord distinct; le scraping sans consentement écrit préalable est interdit. [Reddit User Agreement](https://redditinc.com/policies/user-agreement). | Pas de scraping de posts, même publics. Une intégration utilisant l’API officielle nécessiterait sa propre revue de permissions et de conditions; elle n’est pas implémentée ici. |
| Vimeo | Vimeo indique que le téléchargement est possible quand le propriétaire a activé l’option et que son article officiel avertit que les sites tiers qui capturent un média ou contournent ce réglage ne sont pas autorisés. [Vimeo download help](https://help.vimeo.com/hc/en-us/articles/12426502581265-How-to-download-a-video-on-Vimeo), [Vimeo guidance on third-party downloaders](https://vimeo.com/blog/post/how-to-download-videos-from-vimeo). | N’envisager qu’un flux qui respecte le réglage et le bouton du propriétaire, par une interface autorisée. Aucun extracteur public ne doit contourner le réglage de téléchargement. |
| Dailymotion | Les conditions interdisent l’accès automatisé sans accord écrit préalable et limitent l’usage du contenu tiers au streaming dans le cadre des fonctions prévues. [Dailymotion Terms of Use](https://legal.dailymotion.com/en/terms-of-use/). | Pas de service de téléchargement automatisé sans autorisation écrite préalable de Dailymotion. |

## Décision de publication

Les propositions Facebook/Reddit/Vimeo/Dailymotion sont inscrites comme brouillons internes, avec `published: false`, copie marquée `draft` et chaque gate fermée. Aucune URL n’est rendue, ajoutée au sitemap, maillée ou présentée dans l’interface. Les liens autorisés et les résultats de l’opérateur restent exigés pour Instagram et X; aucune ressource `operator/authorized-links.txt` n’est présente dans l’environnement. Ces éléments ne suffisent pas, à eux seuls, à établir une permission de plateforme.

Pour Facebook, Reddit, Vimeo et Dailymotion, une publication demanderait d’abord une autorisation écrite ou une voie explicitement autorisée par la plateforme, puis une vérification fonctionnelle de médias dont VidFetch ou l’opérateur détient les droits. Les limites, formats, types d’URL et erreurs restent des valeurs à confirmer; aucune promesse utilisateur n’est autorisée avant ces étapes. Aucun cookie, compte, proxy, empreinte modifiée, contournement ou téléchargement réel n’a été utilisé.

Le script opérateur `scripts/ovh/verify-platform-links.mjs` accepte maintenant des URL individuelles de ces quatre candidats, en plus d’Instagram et X, et écrit un rapport distinct par plateforme. Le format de lien est volontairement restreint (pas de profil, requête ou fragment). Il ne visite pas les sites source : les domaines des plateformes sont bloqués dans son navigateur; les requêtes passent seulement par le formulaire et l’API publique VidFetch, avec quotas normaux. Les candidats wave 2 ne sont pas reconnus par le moteur et le script est donc prévu pour une future campagne après autorisation écrite et prise en charge du runtime. **Ne pas le lancer pour eux maintenant.** Aucun fichier `operator/authorized-links.txt` n’a été trouvé.

Après autorisation et ajout explicite du support technique, la commande opérateur restera :

```sh
node scripts/ovh/verify-platform-links.mjs --links /chemin/liens-autorises.txt --out /chemin/rapport-prive --confirm-rights
```

Elle demande une confirmation interactive `I HAVE PERMISSION`, limite chaque exécution à trois liens et six opérations maximum, et s’arrête sur refus/quota. Cette revue n’a exécuté ni cette commande ni un appel à la production.

## Sources complémentaires

- [Reddit User Agreement, section 7](https://redditinc.com/policies/user-agreement)
- [Vimeo Help Center: downloading is controlled by the owner](https://help.vimeo.com/hc/en-us/articles/12426502581265-How-to-download-a-video-on-Vimeo)
- [Dailymotion Terms of Use, section 6.1(ix) and section 6.9, updated June 30, 2026 and effective July 7, 2026](https://legal.dailymotion.com/en/terms-of-use/)
- [X Terms of Service, effective October 9, 2026](https://x.com/en/tos) — scraping without prior written consent is prohibited; this reinforces the existing closed X gate.
- [Meta: How We Combat Scraping](https://about.fb.com/news/2021/04/how-we-combat-scraping/)
