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

export type InputCopy = {
  placeholder: string; idle: string; empty: string; recognized: string;
  videoBadge: string; audioBadge: string; trust: readonly [string, string, string];
};
/** Frontend-only copy: never imported by the protected gateway dictionaries. */
export const INPUT_COPY: Record<Locale, InputCopy> = {
  en: { placeholder: "Paste the TikTok link here", idle: "Works with TikTok links:", empty: "Paste a TikTok link into the field first.", recognized: "Link recognized. MP4 and MP3 formats appear in the next step.", videoBadge: "MP4 video", audioBadge: "MP3 audio", trust: ["Free", "No app", "No sign-up"] },
  fr: { placeholder: "Collez le lien TikTok ici", idle: "Fonctionne avec les liens TikTok :", empty: "Collez d’abord un lien TikTok dans le champ.", recognized: "Lien reconnu. Les formats MP4 et MP3 s’affichent à l’étape suivante.", videoBadge: "MP4 vidéo", audioBadge: "MP3 audio", trust: ["Gratuit", "Sans application", "Sans inscription"] },
  es: { placeholder: "Pega el enlace de TikTok aquí", idle: "Funciona con enlaces de TikTok:", empty: "Primero pega un enlace de TikTok en el campo.", recognized: "Enlace reconocido. Los formatos MP4 y MP3 aparecen en el siguiente paso.", videoBadge: "Vídeo MP4", audioBadge: "Audio MP3", trust: ["Gratis", "Sin aplicación", "Sin registro"] },
  "pt-BR": { placeholder: "Cole o link do TikTok aqui", idle: "Funciona com links do TikTok:", empty: "Primeiro, cole um link do TikTok no campo.", recognized: "Link reconhecido. Os formatos MP4 e MP3 aparecem na próxima etapa.", videoBadge: "Vídeo MP4", audioBadge: "Áudio MP3", trust: ["Grátis", "Sem aplicativo", "Sem cadastro"] },
  id: { placeholder: "Tempel tautan TikTok di sini", idle: "Mendukung tautan TikTok:", empty: "Tempel tautan TikTok di kolom ini terlebih dahulu.", recognized: "Tautan dikenali. Pilihan format MP4 dan MP3 muncul pada langkah berikutnya.", videoBadge: "Video MP4", audioBadge: "Audio MP3", trust: ["Gratis", "Tanpa aplikasi", "Tanpa pendaftaran"] },
  de: { placeholder: "TikTok-Link hier einfügen", idle: "Funktioniert mit TikTok-Links:", empty: "Füge zuerst einen TikTok-Link in das Feld ein.", recognized: "Link erkannt. Die Formate MP4 und MP3 erscheinen im nächsten Schritt.", videoBadge: "MP4-Video", audioBadge: "MP3-Audio", trust: ["Kostenlos", "Ohne App", "Ohne Anmeldung"] },
  it: { placeholder: "Incolla qui il link di TikTok", idle: "Funziona con i link di TikTok:", empty: "Incolla prima un link di TikTok nel campo.", recognized: "Link riconosciuto. I formati MP4 e MP3 vengono mostrati nel passaggio successivo.", videoBadge: "Video MP4", audioBadge: "Audio MP3", trust: ["Gratis", "Senza app", "Senza registrazione"] },
  ar: { placeholder: "ألصق رابط تيك توك هنا", idle: "يدعم روابط تيك توك:", empty: "ألصق رابط تيك توك في الحقل أولًا.", recognized: "تم التعرّف على الرابط. تظهر صيغتا MP4 وMP3 في الخطوة التالية.", videoBadge: "فيديو MP4", audioBadge: "صوت MP3", trust: ["مجاني", "دون تطبيق", "دون تسجيل"] },
};
