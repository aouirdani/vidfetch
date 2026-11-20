import type { Locale } from "./config";

// Frontend-only presentation; not part of the gateway helper dictionaries.
export const restrictedPostMessage = {
  en: "This video is not available to download from our server: TikTok restricts access to it.",
  fr: "Cette vidéo n’est pas disponible au téléchargement depuis notre serveur : TikTok en restreint l’accès.",
  es: "Este vídeo no se puede descargar desde nuestro servidor: TikTok restringe el acceso.",
  "pt-BR": "Este vídeo não está disponível para download pelo nosso servidor: o TikTok restringe o acesso a ele.",
  id: "Video ini tidak dapat diunduh melalui server kami karena TikTok membatasi aksesnya.",
  de: "Dieses Video kann über unseren Server nicht heruntergeladen werden: TikTok schränkt den Zugriff darauf ein.",
  it: "Questo video non può essere scaricato dal nostro server: TikTok ne limita l’accesso.",
  ar: "لا يمكن تنزيل هذا الفيديو عبر خادمنا لأن TikTok يقيّد الوصول إليه.",
} satisfies Record<Locale, string>;
