# VidFetch et la règle AdSense sur les téléchargements de vidéos (27/10/2026)

Analyse documentée, sans avis juridique : seul Google décide de l'application de ses règles.

Sources lues le 27/10/2026, listées en fin de document. Rien n'a été fait dans AdSense.

## 1. Portée exacte de la règle

**Où elle se trouve.** Google Publisher Policies, section « Incitation à un comportement malhonnête » (*Enabling dishonest behavior*), puce sur le piratage. Exemples cités :
- « products or services that bypass copyright protection, including circumvention of digital rights management technologies » ;
- « pages that assist or enable users to download streaming videos if prohibited by the content provider ».

Version française (9335564) : « pages favorisant ou permettant le téléchargement de vidéos en streaming, lorsque leur fournisseur l'interdit ».

**Règle associée** (10436828) : « Ads may not be placed on pages that sell or promote content that enables dishonest behavior. »

**Conséquence prévue** (10502938) : Google peut bloquer les annonces, suspendre ou résilier le compte.

**Trois conditions cumulatives se lisent dans le texte :**
1. la page aide ou permet à l'utilisateur de télécharger ;
2. il s'agit de vidéos en streaming ;
3. le fournisseur du contenu l'interdit.

**Ce que le texte ne dit pas :**
- ce n'est pas une interdiction générale des téléchargeurs : tout dépend des règles du fournisseur ;
- aucune plateforme n'est nommée ;
- rien sur la conversion en MP3 ;
- aucune exception pour les avertissements du type « ne téléchargez que vos contenus ».

## 2. Application probable à VidFetch

| Condition | VidFetch aujourd'hui | Évaluation |
|---|---|---|
| La page aide ou permet de télécharger | Le formulaire est la fonction principale : accueils et pages TikTok | Remplie |
| Vidéos en streaming | Vidéos TikTok diffusées par la plateforme | Très probablement remplie |
| Interdit par le fournisseur | Conditions TikTok (voir ci-dessous). Le moteur extrait côté serveur avec yt-dlp, un logiciel non fourni ni approuvé par TikTok. Le code ne consulte pas le réglage de téléchargement du créateur | Très probablement remplie |

**Ce que disent les conditions de TikTok :**
- version EEE, §4.5 : interdiction d'extraire des données ou du contenu « using any automated system or software », sauf logiciel fourni ou approuvé par écrit par TikTok ;
- version US, §3.4 : interdiction de « scrape, crawl, export or otherwise extract any data or content », sauf approbation écrite ;
- la licence de téléchargement entre utilisateurs (EEE, §4.9) s'exerce « using the Platform » et dépend des réglages du créateur.

**Autres plateformes :**
- **YouTube :** VidFetch n'envoie aucune requête (lien bloqué dans la page). La condition 1 n'est donc pas remplie.
- **Instagram et X :** les liens sont acceptés par le formulaire mais non vérifiés. Leurs conditions n'ont pas été relues pour ce diagnostic. Il faudrait faire la même analyse avant toute ouverture.

**Conclusion :** un examinateur qui applique la règle telle qu'elle est écrite a de bonnes raisons de classer VidFetch dans son champ.
- **Ce qui reste incertain :** la pratique réelle de Google, qui n'a pas cité cette règle.
- **Ce que je n'utilise pas comme argument :** la présence éventuelle de publicités chez des concurrents. Leur statut AdSense n'est pas vérifiable d'ici.

## 3. Refus notifié et autre motif possible

**Motif notifié :** « Contenu à faible valeur informative ». C'est une condition d'approbation (10015918 : contenu unique, navigation, services annoncés réellement fournis).

Des défauts confirmés le justifient :
- pages vides ;
- pages trompeuses YouTube, Instagram et X ;
- contenu générique et traduit ;
- contacts inopérants.

Le lot SEO 2 en corrige une partie.

**Motif possible non notifié :** la règle sur les téléchargements est une règle de conformité distincte. Rien n'indique que Google l'ait appliquée. Deux scénarios restent possibles :
- un nouvel examen la soulève ;
- le site est approuvé, puis les annonces sont limitées ou le compte est sanctionné lors d'un contrôle ultérieur.

**Conséquence pratique :** corriger la faible valeur est nécessaire, mais ne suffit pas. Le risque le plus lourd concerne le compte AdSense lui-même, pas seulement ce site.

## 4. Obstacles qu'aucune amélioration éditoriale ne lève

- La fonction principale : extraction automatisée côté serveur de vidéos TikTok.
- Les conditions de TikTok, que VidFetch ne peut pas modifier.
- Les avertissements, guides et textes légaux : ils ne changent aucune des trois conditions.

**Exclu, car interdit et dangereux pour le compte :**
- masquer l'outil aux examinateurs ou leur servir un contenu différent (cloaking) ;
- placer les annonces sur des pages sans l'outil qui le promeuvent (règle « promote ») ;
- déclarer « corrigé » ce qui ne l'est pas.

## 5. Voies légitimes

| Voie | Description | Compatibilité AdSense | Effort | Décision |
|---|---|---|---|---|
| A. Garder VidFetch tel quel, sans AdSense | Pas d'annonces Google. Autres revenus possibles : dons volontaires, ou une autre régie dont les règles acceptent explicitement ce type d'outil (aucune vérifiée ici, à contrôler avant toute inscription) | Sans objet | Faible | Propriétaire |
| B. Outil de conversion local | Convertir les fichiers que l'utilisateur possède déjà (MP4 vers MP3, réduction de taille, format compatible téléphone), dans le navigateur. Aucun téléchargement depuis une plateforme. S'appuie sur les guides existants (formats, codecs, MP3/M4A) | Plausible, sous réserve du contenu (pas de téléchargement de vidéos en streaming) | Élevé | Propriétaire |
| C. Vos propres vidéos TikTok, par les voies officielles | Guides et aide autour des fonctions officielles de TikTok (enregistrement autorisé par le créateur, export de ses données). Ces fonctions sont à vérifier sur support.tiktok.com, non vérifiées ici. Autre piste : les API développeur de TikTok pour les contenus de l'utilisateur connecté, après étude de leurs conditions | Plausible si VidFetch n'extrait plus de contenu lui-même | Moyen à élevé | Propriétaire |
| D. Accord écrit de TikTok | Seule exception prévue par §4.5 et §3.4 | Rendrait la condition 3 caduque | Incertain | Propriétaire |
| E. Site éditorial séparé | Guides et outil de conversion local monétisés, sans promouvoir le téléchargeur | Plausible si vraiment séparé ; non conforme s'il sert de vitrine au téléchargeur | Moyen | Propriétaire |

**Recommandation :** décider d'abord du produit.
- **VidFetch reste un téléchargeur TikTok :** NO-GO AdSense. Le SEO peut continuer sans annonces Google.
- **Évolution vers B, C ou E :** une nouvelle demande devient défendable, une fois le contenu conforme publié et la checklist du rapport du lot 2 remplie.

## Sources

- [Règlement Google pour les éditeurs (FR)](https://support.google.com/adsense/answer/9335564?hl=fr)
- [Google Publisher Policies](https://support.google.com/publisherpolicies/answer/10502938?hl=en)
- [Enabling dishonest behavior](https://support.google.com/publisherpolicies/answer/10436828?hl=en)
- [Expérience utilisateur et contenu (AdSense)](https://support.google.com/adsense/answer/10015918?hl=fr)
- [AdSense Program policies](https://support.google.com/adsense/answer/48182?hl=en)
- [TikTok Terms of Service, EEA](https://www.tiktok.com/legal/page/eea/terms-of-service/en)
- [TikTok Terms of Service, US](https://www.tiktok.com/legal/page/us/terms-of-service/en)
