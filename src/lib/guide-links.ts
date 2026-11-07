import type { Locale } from "../i18n/config";
import { availableGuides, isPublishedGuide } from "./guides";

export const TIKTOK_GUIDE_IDS = ["why-cant-i-save-tiktok", "save-tiktok-sound-mp3", "save-tiktok-phone-gallery"];
export const GUIDE_TITLES: Record<Locale, string> = {
  en: "TikTok guides", fr: "Guides TikTok", es: "Guías de TikTok", "pt-BR": "Guias do TikTok",
  id: "Panduan TikTok", de: "TikTok-Ratgeber", it: "Guide TikTok", ar: "أدلة تيك توك",
};
export const BLOG_TITLES: Record<Locale, string> = {
  en: "TikTok, Video & Audio Guides", fr: "Guides TikTok, vidéo et audio", es: "Guías de TikTok, video y audio",
  "pt-BR": "Guias de TikTok, vídeo e áudio", id: "Panduan TikTok, Video, dan Audio", de: "Ratgeber zu TikTok, Video und Audio",
  it: "Guide su TikTok, video e audio", ar: "أدلة تيك توك والفيديو والصوت",
};
export function publishedGuides(locale: Locale) {
  return availableGuides(locale).filter(isPublishedGuide);
}
export function homeGuides(locale: Locale) {
  return publishedGuides(locale).sort((a, b) => Number(TIKTOK_GUIDE_IDS.includes(b.id)) - Number(TIKTOK_GUIDE_IDS.includes(a.id))).slice(0, 3);
}
export function tiktokGuides(locale: Locale) {
  return publishedGuides(locale).filter(guide => TIKTOK_GUIDE_IDS.includes(guide.id));
}
