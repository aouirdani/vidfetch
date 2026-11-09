import type { Locale } from "../i18n/config";

/** Localized form hints stay outside the dictionaries embedded in the gateway. */
export type FormCopy = {
  /** State the verified platform and the unavailable platform explicitly. */
  supportedHint: string;
  /** A public TikTok link or its share message; no access to an account or drafts. */
  tiktokHint: string;
};

/** Link shapes, shown as text; they never submit a download automatically. */
export const TIKTOK_LINK_SHAPES = ["tiktok.com/@…/video/…", "vm.tiktok.com/…", "tiktok.com/t/…"] as const;

export const FORM_COPY: Record<Locale, FormCopy> = {
  en: {
    supportedHint: "TikTok is the only platform verified here. YouTube is unavailable.",
    tiktokHint: "Paste the link of a public TikTok video, or the whole share message copied from the app.",
  },
  fr: {
    supportedHint: "TikTok est la seule plateforme vérifiée ici. YouTube n’est pas disponible.",
    tiktokHint: "Collez le lien d’une vidéo TikTok publique, ou tout le message de partage copié depuis l’application.",
  },
  es: {
    supportedHint: "TikTok es la única plataforma verificada aquí. YouTube no está disponible.",
    tiktokHint: "Pega el enlace de un vídeo público de TikTok o el mensaje completo que has copiado al compartirlo desde la aplicación.",
  },
  "pt-BR": {
    supportedHint: "TikTok é a única plataforma verificada aqui. YouTube não está disponível.",
    tiktokHint: "Cole o link de um vídeo público do TikTok ou a mensagem completa copiada ao compartilhar pelo aplicativo.",
  },
  id: {
    supportedHint: "TikTok adalah satu-satunya platform yang telah diverifikasi di sini. YouTube tidak tersedia.",
    tiktokHint: "Tempel tautan video TikTok publik atau seluruh pesan berbagi yang disalin dari aplikasi.",
  },
  de: {
    supportedHint: "TikTok ist hier die einzige verifizierte Plattform. YouTube ist nicht verfügbar.",
    tiktokHint: "Füge den Link zu einem öffentlichen TikTok-Video oder die gesamte aus der App kopierte Teilenachricht ein.",
  },
  it: {
    supportedHint: "TikTok è l’unica piattaforma verificata qui. YouTube non è disponibile.",
    tiktokHint: "Incolla il link di un video pubblico di TikTok o l’intero messaggio di condivisione copiato dall’app.",
  },
  ar: {
    supportedHint: "TikTok هي المنصة الوحيدة التي تم التحقق منها هنا. YouTube غير متاح.",
    tiktokHint: "ألصق رابط فيديو TikTok عام، أو رسالة المشاركة كاملةً كما نُسخت من التطبيق.",
  },
};
