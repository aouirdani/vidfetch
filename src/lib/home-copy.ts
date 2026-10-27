import type { Locale } from "../i18n/config";
import { dictionary } from "../i18n/dictionaries";
import { CONTENT_UPDATED } from "./seo";

/**
 * Home page search copy, centred on TikTok: the platform validated on our hosting.
 * Kept out of src/i18n/messages on purpose: the download gateway bundles those dictionaries, and any change there
 * changes the gateway artifact, which the CI promoter refuses to deploy without a separate review.
 * English and French only: es, pt-BR, id, de, it and ar keep the wording of the dictionaries (already published)
 * until a native speaker has reviewed a new version. A language without an entry here falls back to them.
 */
export type HomeCopy = {
  title: string; description: string; heroTitle: string; heroAccent: string; heroDescription: string;
  /** Answer to the home FAQ "Which links can I try?": TikTok verified, Instagram and X not yet, YouTube blocked. */
  platformsAnswer: string;
};

/** Last substantial change of the homes that have their own copy here (sitemap lastmod, WebPage dateModified). */
export const HOME_UPDATED = "2026-10-27";

export const HOME_COPY: Partial<Record<Locale, HomeCopy>> = {
  en: {
    title: "TikTok Downloader – Save MP4 Video or MP3 Audio | VidFetch",
    description: "Paste the link of a public TikTok video and save it as MP4, or keep only the sound as MP3. Free, no account and no app, on your phone or computer.",
    heroTitle: "Save TikTok videos as MP4",
    heroAccent: "or keep the sound as MP3.",
    heroDescription: "Paste the link of a public TikTok video you are allowed to keep. VidFetch lists the formats TikTok provides and saves the one you choose to your phone or computer.",
    platformsAnswer: "Links to public TikTok videos are verified on our hosting, including share links from the app. Instagram and X links are recognized but not verified yet, so they may fail. YouTube is not available: it asks hosting servers like ours to sign in, and VidFetch does not get around that check.",
  },
  fr: {
    title: "Télécharger des vidéos TikTok en MP4 ou MP3 | VidFetch",
    description: "Collez le lien d'une vidéo TikTok publique et enregistrez-la en MP4, ou gardez seulement le son en MP3. Gratuit, sans compte ni appli, sur mobile ou ordinateur.",
    heroTitle: "Enregistrez vos vidéos TikTok en MP4",
    heroAccent: "ou gardez seulement le son en MP3.",
    heroDescription: "Collez le lien d'une vidéo TikTok publique que vous avez le droit de conserver. VidFetch affiche les formats fournis par TikTok et enregistre celui que vous choisissez sur votre téléphone ou votre ordinateur.",
    platformsAnswer: "Les liens de vidéos TikTok publiques sont vérifiés sur notre hébergement, y compris les liens de partage de l'application. Les liens Instagram et X sont reconnus mais pas encore vérifiés : ils peuvent échouer. YouTube n'est pas disponible : il exige une connexion de la part des serveurs d'hébergement comme le nôtre, et VidFetch ne contourne pas cette vérification.",
  },
};

/** The home copy of a language: its own entry above, otherwise the published wording of the dictionaries. */
export function homeCopy(locale: Locale): HomeCopy & { updated: string } {
  const own = HOME_COPY[locale];
  if (own) return { ...own, updated: HOME_UPDATED };
  const d = dictionary(locale);
  return { title: d.metaTitle, description: d.metaDescription, heroTitle: d.heroTitle, heroAccent: d.heroAccent, heroDescription: d.heroDescription, platformsAnswer: d.faq2a, updated: CONTENT_UPDATED };
}
