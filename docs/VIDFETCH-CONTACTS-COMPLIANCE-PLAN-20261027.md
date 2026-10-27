# VidFetch : contacts, mentions légales et consentement (plan au 27/10/2026)

`vidfetch.app` est le seul domaine officiel de VidFetch (décision du propriétaire, 27/10/2026).

Ce plan ne modifie ni le DNS, ni les adresses en production, ni la configuration AdSense : chacune de ces actions attend une autorisation.

## 1. État constaté le 27/10

**DNS de `vidfetch.app`**, vu par un résolveur public :
- NS Cloudflare (`leo` et `maria.ns.cloudflare.com`) ;
- TXT `google-site-verification` présent ;
- **aucun MX** : le domaine ne reçoit aucun courriel.

**En production**, la page `/legal` affiche `legal@`, `privacy@` et `abuse@vidfetch.io`. Aucune ne reçoit de courriel.

### Inventaire des références à `vidfetch.io` dans le dépôt

| Emplacement | Visible publiquement | Traitement dans la PR du lot 2 |
|---|---|---|
| `src/i18n/messages/*.json` : `notice1`, `privacy6`, `report1` (8 langues) | Oui : page légale et données envoyées au navigateur | Remplacées **au rendu** par les adresses `@vidfetch.app` (`withOfficialContacts`). Les fichiers sont intacts car ils font partie de l'empreinte de la passerelle |
| `src/components/Footer.tsx` (`mailto:abuse@…`) | Oui, sur toutes les pages | `abuse@vidfetch.app` |
| `src/lib/seo.ts` (`SITE.email`, données structurées `ContactPoint`) | Non rendu aujourd'hui | `support@vidfetch.app` |
| `src/server/unavailable-api.ts`, `src/server/local-api/health.ts` (`service`) | Seulement sur les cibles hors OVH ; en production, `/api/health` répond déjà `"service":"VidFetch"` | `"VidFetch"` |
| README, `.env.example`, `docker-compose.yml`, `server.js` (CORS par défaut), `DEPLOY-CLOUDFLARE.md`, `DEPLOY-VERCEL.md`, `tests/cloudflare.test.ts` | Non | `vidfetch.app` |
| `backend/server.ts` (moteur, `service` du bilan de santé interne en loopback) | Non | **Inchangé**, car l'empreinte du moteur est protégée. À reprendre lors d'une future version du moteur |
| `backend/REPORT.md`, `backend/preproduction/OVH-VPS-DEPLOYMENT.md`, `docs/OVH-FULL-MIGRATION.md` | Non (historique) | Inchangés : ils décrivent un état passé |

**Contrôle automatique.** verify-site échoue si une page rendue contient `vidfetch.io`. Il exige aussi les trois adresses `@vidfetch.app` sur chaque page légale et le lien `mailto:abuse@vidfetch.app` dans le pied de page.

## 2. Recevoir les courriels sur `vidfetch.app` : Cloudflare Email Routing (gratuit)

D'après la documentation Cloudflare :
- **Gratuit :** la réception est « Unlimited » sur le plan Workers Free.
- **DNS :** le domaine doit utiliser le DNS Cloudflare, ce qui est le cas.

### À faire par le propriétaire (aucune action de ma part sans autorisation)

1. Choisir la **boîte de destination**, une adresse personnelle ou professionnelle déjà lue chaque jour.
2. **Activer la réception :**
   - tableau de bord Cloudflare > `vidfetch.app` > **Email** > **Email Routing** > activer ;
   - Cloudflare propose d'ajouter :
     - des **MX** vers `route1`, `route2` et `route3.mx.cloudflare.net`, avec des priorités attribuées automatiquement (un exemple de la documentation montre d'autres noms : reprendre ceux affichés par le tableau de bord) ;
     - un **TXT SPF** `v=spf1 include:_spf.mx.cloudflare.net ~all` ;
     - un **TXT DKIM** sur `cf2024-1._domainkey`.
   - Le domaine n'a ni MX ni SPF existants, donc rien à fusionner. Le TXT de vérification Google n'est pas touché.
3. **Vérifier la boîte de destination :** Cloudflare envoie un courriel de vérification. Une règle pointant vers une adresse non vérifiée reste désactivée.
4. **Créer 4 adresses**, chacune transférée vers la boîte de destination :

   | Adresse | Usage affiché sur le site |
   |---|---|
   | `legal@vidfetch.app` | Mentions légales |
   | `privacy@vidfetch.app` | Confidentialité, demandes RGPD |
   | `abuse@vidfetch.app` | Abus et droits d'auteur (pied de page et page légale) |
   | `support@vidfetch.app` | Support (données structurées) |

   Une adresse « catch-all » est possible, mais je la déconseille : elle reçoit aussi le spam envoyé à des adresses inventées.
5. **DMARC (recommandé, facultatif)** : TXT `_dmarc.vidfetch.app` = `v=DMARC1; p=none; rua=mailto:<adresse de rapport>`. On commence par `p=none` pour observer, comme le conseille Cloudflare.
6. **Tests :**
   - `dig MX vidfetch.app` répond avec les MX Cloudflare (propagation habituelle : 5 à 15 minutes) ;
   - envoyer un courriel depuis un compte externe vers chacune des 4 adresses et vérifier la réception ;
   - vérifier dans les en-têtes que SPF et DKIM sont en `pass`.

### Limites à connaître

- Email Routing **reçoit et transfère seulement** : il n'envoie pas de courriel depuis `@vidfetch.app`. Une réponse partira de la boîte de destination.
- Pour répondre en tant que `@vidfetch.app`, il faut un service d'envoi. Cloudflare Email Sending exige le plan Workers Paid ; un autre fournisseur est possible. C'est une décision du propriétaire, pas nécessaire pour être joignable.
- Limites publiées : 200 règles par domaine, 200 adresses de destination par compte, messages de 25 Mio maximum.
- Désactiver Email Routing retire les enregistrements MX, SPF et DKIM qu'il a ajoutés.

### Ordre recommandé

1. Le propriétaire active Email Routing et réussit les 4 tests.
2. Fusion de la PR, puis déploiement contrôlé : GO séparés.
3. Plus tard, une version revue de la passerelle mettra les dictionnaires à jour : `vidfetch.io` disparaîtra aussi des fichiers sources. Ce n'est pas urgent, puisque le rendu l'affiche déjà en `vidfetch.app`.

Déployer la PR avant l'étape 1 ne rend pas la situation pire qu'aujourd'hui : les adresses restent sans réception. Il vaut quand même mieux activer la réception d'abord.

## 3. Mentions légales : informations réelles à fournir

Le texte actuel (`notice1`) ne dit que : « VidFetch est un service automatisé… Contact : legal@… ». Il n'identifie ni l'éditeur ni l'hébergeur.

**Le droit français**, si l'éditeur en relève : depuis la loi SREN du 21/05/2024, les obligations d'identification des éditeurs de services en ligne sont à l'article 1-1 de la LCEN (loi n° 2004-575). Les guides consultés résument :

| Situation | À afficher |
|---|---|
| Éditeur professionnel, personne physique | Nom, prénom, domicile, téléphone ; numéro RCS ou répertoire des métiers si inscrit |
| Éditeur professionnel, société | Dénomination, siège social, téléphone, forme juridique, capital, numéro RCS |
| Dans tous les cas professionnels | Directeur ou directrice de la publication ; hébergeur (nom, adresse, téléphone) |
| Éditeur non professionnel | Peut ne publier que l'hébergeur, à condition d'avoir communiqué son identité complète à celui-ci |

**Points de vigilance :**
- Un site qui affiche de la publicité, ou qui veut en afficher, a une activité économique. Le statut « non professionnel » est alors très discutable : à faire confirmer.
- **Hébergeur :** OVH (VPS) ; dénomination et adresse exactes à reprendre du contrat OVHcloud. Cloudflare est un intermédiaire technique (CDN et DNS) à citer comme sous-traitant dans la politique de confidentialité.
- Vérifier le texte consolidé de l'article 1-1 sur Légifrance, ou auprès d'un professionnel. Je n'invente aucune identité.

**Politique de confidentialité (RGPD, art. 13).** Le texte décrit déjà les traitements techniques (tampons, empreintes, journaux, cookies Turnstile, cookies AdSense). Il manque :
- l'identité et le contact du responsable de traitement ;
- les bases légales ;
- les destinataires et sous-traitants : OVH, Cloudflare, Google ;
- les transferts hors UE ;
- les durées de conservation ;
- le droit de réclamation auprès de la CNIL.

À compléter avec les informations réelles.

**Mise en œuvre technique (après réception des informations) :**
- même méthode que `ADVERTISING_PRIVACY` : un bloc d'identité au rendu, hors dictionnaires, donc empreintes inchangées ;
- noms et adresses identiques dans toutes les langues ; libellés relus en FR et EN, puis par des locuteurs natifs pour les 6 autres langues, faute de quoi le bloc reste en anglais.

## 4. Consentement : CMP certifiée

**Exigences** (sources en fin de document) :
- **Google (AdSense 13554116) :** CMP certifiée par Google et intégrée au TCF de l'IAB, obligatoire pour les annonces personnalisées dans l'EEE et au Royaume-Uni depuis le 16/01/2024, et en Suisse depuis le 31/07/2024. Sans CMP certifiée : annonces non personnalisées ou limitées au mieux.
- **Règles de consentement de l'UE (Google) :**
  - consentement valide pour les cookies et le stockage local lorsque la loi l'exige ;
  - conservation des preuves ;
  - retrait facile.
- **CNIL :**
  - aucun cookie publicitaire avant consentement ;
  - refuser doit être aussi simple qu'accepter (deux boutons de même niveau, « tout accepter » et « tout refuser ») ;
  - fermer le bandeau ou continuer à naviguer équivaut à un refus ;
  - retrait possible à tout moment (par exemple un lien en pied de page) ;
  - choix conservé environ 6 mois.
  - Les traceurs de sécurité et d'authentification sont exemptés : le défi Turnstile et les cookies d'autorisation de téléchargement de VidFetch en relèvent.

**État :**
- Le code ne contient aucune CMP.
- Je n'ai pas vérifié si un message « Réglementations européennes » est publié dans AdSense, faute d'autorisation d'action dans AdSense.
- Test sans rien modifier, par le propriétaire : ouvrir `https://vidfetch.app/?fc=alwaysshow&fctype=gdpr`. Si un message est publié et que la balise AdSense est sur la page, il s'affiche ; sinon, aucun message n'est configuré.

**Proposition, à faire par le propriétaire après GO :**
1. AdSense > **Confidentialité et messages** > **Réglementations européennes** > **Créer** :
   - site `vidfetch.app`, langues du site ;
   - option **« Ne pas consentir » activée**, donc 3 boutons, comme l'exige la CNIL ;
   - URL de confidentialité `https://vidfetch.app/legal#privacy` ;
   - publier.
   - Google indique que ce message est certifié TCF et qu'il est servi par la balise AdSense. Aucune page lue n'indique de prix.
2. Ajouter un lien « Gérer les cookies » en pied de page pour rouvrir le choix (retrait). C'est un changement frontend, à préparer sur GO.
3. Vérifier depuis la France : bandeau visible, aucun cookie publicitaire avant le choix, refus en un clic.

Avec le lot 2, la balise AdSense, et donc le message, ne se chargent que sur les pages de contenu (accueils, pages TikTok). C'est cohérent : aucun cookie publicitaire ailleurs.

## Sources

- [Cloudflare Email Service : router les e-mails](https://developers.cloudflare.com/email-service/get-started/route-emails/)
- [Cloudflare : enregistrements DNS des domaines](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Cloudflare : adresses et règles](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/)
- [Cloudflare : limites](https://developers.cloudflare.com/email-service/platform/limits/)
- [Cloudflare : tarifs](https://developers.cloudflare.com/email-service/platform/pricing/)
- [Cloudflare : Postmaster](https://developers.cloudflare.com/email-service/reference/postmaster/)
- [Cloudflare : authentification des e-mails](https://developers.cloudflare.com/email-service/concepts/email-authentication/)
- [CNIL : cookies et traceurs, que dit la loi ?](https://www.cnil.fr/fr/cookies-et-traceurs-que-dit-la-loi)
- [CNIL : mettre son site en conformité](https://www.cnil.fr/cookies-et-traceurs-comment-mettre-mon-site-web-en-conformite)
- [AdSense : exigences de consentement EEE, Royaume-Uni, Suisse](https://support.google.com/adsense/answer/13554116?hl=en)
- [AdSense : messages « Réglementations européennes »](https://support.google.com/adsense/answer/10961068?hl=en)
- [AdSense : créer un message](https://support.google.com/adsense/answer/10960768?hl=en)
- [AdSense : Confidentialité et messages](https://support.google.com/adsense/answer/10924669?hl=en)
- [Google : règles de consentement de l'UE](https://www.google.com/about/company/user-consent-policy/)
- [Mentions légales après la loi SREN (Simonnet Avocat)](https://www.simonnetavocat.fr/mentions-legales-dun-site-internet-obligations-sanctions-et-modele/)
