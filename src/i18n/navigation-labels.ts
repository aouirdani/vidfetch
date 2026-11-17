import type { Locale } from "./config";

// Frontend-only navigation labels stay out of backend/gateway/helper.ts,
// which bundles the shared extraction dictionaries into a guarded artifact.
export const MENU_LABELS: Record<Locale, string> = {
  en: "Menu",
  fr: "Menu",
  es: "Menú",
  "pt-BR": "Menu",
  id: "Menu",
  de: "Menü",
  it: "Menu",
  ar: "القائمة",
};

export const TRUST_MENU_LABELS: Record<Locale, string> = {
  en: "About and contact",
  fr: "À propos et contact",
  es: "Información y contacto",
  "pt-BR": "Sobre e contato",
  id: "Tentang dan kontak",
  de: "Über uns und Kontakt",
  it: "Informazioni e contatti",
  ar: "حول الموقع والتواصل",
};

export const HEADER_LINKS: Record<Locale, { video: string; audio: string; tools: string }> = {
  en: { video: "TikTok MP4", audio: "TikTok MP3", tools: "Video tools" },
  fr: { video: "TikTok en MP4", audio: "TikTok en MP3", tools: "Outils vidéo" },
  es: { video: "TikTok a MP4", audio: "TikTok a MP3", tools: "Herramientas de vídeo" },
  "pt-BR": { video: "TikTok em MP4", audio: "TikTok em MP3", tools: "Ferramentas de vídeo" },
  id: { video: "TikTok ke MP4", audio: "TikTok ke MP3", tools: "Alat video" },
  de: { video: "TikTok als MP4", audio: "TikTok als MP3", tools: "Video-Werkzeuge" },
  it: { video: "TikTok in MP4", audio: "TikTok in MP3", tools: "Strumenti video" },
  ar: { video: "تيك توك MP4", audio: "تيك توك MP3", tools: "أدوات الفيديو" },
};
