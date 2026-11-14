import type { Locale } from "../i18n/config";

// Presentation labels stay outside the dictionaries shared with the download gateway.
export const SOURCE_ACCESSED: Record<Locale, string> = {
  en: "Accessed", fr: "Consulté le", es: "Consultado el", "pt-BR": "Consultado em",
  id: "Diakses", de: "Abgerufen am", it: "Consultato il", ar: "تاريخ الاطلاع",
};

export const REVIEW_BYLINE: Record<Locale, string> = {
  en: "Written with the help of AI tools, verified and reviewed on",
  fr: "Rédigé avec l’aide d’outils d’IA, vérifié et relu le",
  es: "Redactado con ayuda de herramientas de IA, verificado y revisado el",
  "pt-BR": "Escrito com ajuda de ferramentas de IA, verificado e revisado em",
  id: "Ditulis dengan bantuan alat AI, diperiksa dan ditinjau pada",
  de: "Mit KI-Werkzeugen verfasst, überprüft und gegengelesen am",
  it: "Redatto con l’aiuto di strumenti IA, verificato e riletto il",
  ar: "كُتب بمساعدة أدوات الذكاء الاصطناعي، وتم التحقق منه ومراجعته في",
};
