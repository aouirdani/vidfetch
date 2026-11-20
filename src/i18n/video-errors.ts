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

export const popupBlockedMessage = {
  en: "Allow the download window in your browser, then try again.",
  fr: "Autorisez la fenêtre de téléchargement dans votre navigateur, puis réessayez.",
  es: "Permite la ventana de descarga en el navegador y vuelve a intentarlo.",
  "pt-BR": "Permita a janela de download no navegador e tente novamente.",
  id: "Izinkan jendela unduhan di peramban, lalu coba lagi.",
  de: "Erlaube das Downloadfenster im Browser und versuche es erneut.",
  it: "Consenti la finestra di download nel browser, poi riprova.",
  ar: "اسمح بفتح نافذة التنزيل في المتصفح ثم حاول مجددًا.",
} satisfies Record<Locale, string>;
