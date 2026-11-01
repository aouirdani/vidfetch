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
