import type { Locale } from "../i18n/config";
import { dictionary } from "../i18n/dictionaries";
import { CONTENT_UPDATED } from "./seo";

/**
 * Home page search copy: a generic, multi-platform video downloader (MP4 video, MP3 audio). It names no platform, so
 * it neither promises an unverified one nor competes with the TikTok pages, which carry the TikTok searches. Which
 * platforms are verified is said under the link field (form-copy.ts) and in the FAQ answer below.
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
export const HOME_UPDATED = "2026-10-28";

export const HOME_COPY: Partial<Record<Locale, HomeCopy>> = {
  en: {
    title: "Online Video Downloader – MP4 & MP3 | VidFetch",
    description: "Download videos or save audio from supported platforms. Paste a link, choose an available format and save your file.",
    heroTitle: "Download online videos",
    heroAccent: "as MP4 or MP3",
    heroDescription: "Paste the link of a public video you are allowed to keep. VidFetch lists the formats the platform provides and saves the one you choose to your phone or computer.",
    platformsAnswer: "Links to public TikTok videos are verified on our hosting, including share links from the app. Instagram and X links are recognized but not verified yet, so they may fail. YouTube is not available: it asks hosting servers like ours to sign in, and VidFetch does not get around that check.",
  },
  fr: {
    title: "Téléchargeur de vidéos en ligne – MP4 et MP3 | VidFetch",
    description: "Téléchargez des vidéos et extrayez leur audio depuis les plateformes compatibles. Collez votre lien, choisissez le format disponible et récupérez votre fichier.",
    heroTitle: "Téléchargez des vidéos en ligne",
    heroAccent: "en MP4 ou MP3",
    heroDescription: "Collez le lien d'une vidéo publique que vous avez le droit de conserver. VidFetch affiche les formats proposés par la plateforme et enregistre celui que vous choisissez sur votre téléphone ou votre ordinateur.",
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
