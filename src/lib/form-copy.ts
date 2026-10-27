import type { Locale } from "../i18n/config";

/**
 * Lines under the link form, centred on TikTok: the platform validated on our hosting. Kept out of src/i18n/messages
 * (compiled into the download gateway) and out of the home copy, so the browser only receives these few strings.
 * English and French only: the other languages keep the published dictionary line (supportedHint) until a native
 * speaker has reviewed a new version. The TikTok pages exist in English and French only.
 */
export type FormCopy = {
  /** Every page but the TikTok pages: TikTok works, Instagram and X are not verified yet, YouTube is unavailable. */
  supportedHint: string;
  /** The TikTok pages. */
  tiktokHint: string;
};

/** Shapes of the TikTok links the form accepts, shown as text after the dictionary's "Links look like" label. */
export const TIKTOK_LINK_SHAPES = ["tiktok.com/@…/video/…", "vm.tiktok.com/…", "tiktok.com/t/…"] as const;

export const FORM_COPY: Partial<Record<Locale, FormCopy>> = {
  en: {
    supportedHint: "Works with public TikTok video links. Instagram and X links are accepted but not verified yet; YouTube is unavailable.",
    tiktokHint: "Paste the link of a public TikTok video, or the whole share message copied from the app.",
  },
  fr: {
    supportedHint: "Fonctionne avec les liens de vidéos TikTok publiques. Les liens Instagram et X sont acceptés mais pas encore vérifiés ; YouTube n'est pas disponible.",
    tiktokHint: "Collez le lien d'une vidéo TikTok publique, ou tout le message de partage copié depuis l'application.",
  },
};
