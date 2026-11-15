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
