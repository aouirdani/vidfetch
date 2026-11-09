import type { Locale } from "../i18n/config";

// Presentation labels stay outside the dictionaries shared with the download gateway.
export const SOURCE_ACCESSED: Record<Locale, string> = {
  en: "Accessed", fr: "Consulté le", es: "Consultado el", "pt-BR": "Consultado em",
  id: "Diakses", de: "Abgerufen am", it: "Consultato il", ar: "تاريخ الاطلاع",
};
