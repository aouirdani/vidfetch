import type { Locale } from "../i18n/config";

/**
 * Lines under the link form, centred on TikTok: the platform validated on our hosting. Kept out of src/i18n/messages
 * (compiled into the download gateway) and out of the home copy, so the browser only receives these few strings.
 * es, pt-BR, id, de, it and ar wording awaits a native review.
 */
export type FormCopy = {
  /** Every page but the TikTok pages: TikTok works, Instagram and X are not verified yet, YouTube is unavailable. */
  supportedHint: string;
  /** The TikTok pages. */
  tiktokHint: string;
  /** Label before the accepted TikTok link shapes (plain text, never a link that starts a download). */
  linkFormats: string;
};

/** Shapes of the TikTok links the form accepts, shown as text. */
export const TIKTOK_LINK_SHAPES = ["tiktok.com/@…/video/…", "vm.tiktok.com/…", "tiktok.com/t/…"] as const;

export const FORM_COPY: Record<Locale, FormCopy> = {
  en: {
    supportedHint: "Works with public TikTok video links. Instagram and X links are accepted but not verified yet; YouTube is unavailable.",
    tiktokHint: "Paste the link of a public TikTok video, or the whole share message copied from the app.",
    linkFormats: "Accepted TikTok links:",
  },
  fr: {
    supportedHint: "Fonctionne avec les liens de vidéos TikTok publiques. Les liens Instagram et X sont acceptés mais pas encore vérifiés ; YouTube n'est pas disponible.",
    tiktokHint: "Collez le lien d'une vidéo TikTok publique, ou tout le message de partage copié depuis l'application.",
    linkFormats: "Liens TikTok acceptés :",
  },
  es: {
    supportedHint: "Funciona con enlaces de vídeos públicos de TikTok. Los enlaces de Instagram y X se aceptan, pero aún no están verificados; YouTube no está disponible.",
    tiktokHint: "Pega el enlace de un vídeo público de TikTok o el mensaje completo que copias al compartir desde la app.",
    linkFormats: "Enlaces de TikTok aceptados:",
  },
  "pt-BR": {
    supportedHint: "Funciona com links de vídeos públicos do TikTok. Links do Instagram e do X são aceitos, mas ainda não foram verificados; o YouTube não está disponível.",
    tiktokHint: "Cole o link de um vídeo público do TikTok ou a mensagem de compartilhamento inteira copiada do app.",
    linkFormats: "Links do TikTok aceitos:",
  },
  id: {
    supportedHint: "Berfungsi untuk tautan video TikTok publik. Tautan Instagram dan X diterima tetapi belum diverifikasi; YouTube tidak tersedia.",
    tiktokHint: "Tempel tautan video TikTok publik, atau seluruh pesan berbagi yang disalin dari aplikasi.",
    linkFormats: "Tautan TikTok yang diterima:",
  },
  de: {
    supportedHint: "Funktioniert mit Links zu öffentlichen TikTok-Videos. Instagram- und X-Links werden angenommen, sind aber noch nicht geprüft; YouTube ist nicht verfügbar.",
    tiktokHint: "Füge den Link eines öffentlichen TikTok-Videos ein oder die ganze Teilen-Nachricht aus der App.",
    linkFormats: "Akzeptierte TikTok-Links:",
  },
  it: {
    supportedHint: "Funziona con i link di video TikTok pubblici. I link di Instagram e X sono accettati ma non ancora verificati; YouTube non è disponibile.",
    tiktokHint: "Incolla il link di un video TikTok pubblico o l'intero messaggio di condivisione copiato dall'app.",
    linkFormats: "Link TikTok accettati:",
  },
  ar: {
    supportedHint: "يعمل مع روابط فيديوهات تيك توك العامة. تُقبل روابط إنستغرام وX لكن لم يجرِ التحقق منها بعد؛ يوتيوب غير متاح.",
    tiktokHint: "الصق رابط فيديو عام على تيك توك، أو رسالة المشاركة كاملة كما نسختها من التطبيق.",
    linkFormats: "روابط تيك توك المقبولة:",
  },
};
