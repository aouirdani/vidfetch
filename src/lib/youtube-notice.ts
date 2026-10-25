import type { Locale } from "../i18n/config";
/**
 * Shown as soon as a YouTube link is recognised: YouTube asks hosting servers like ours to sign in, and VidFetch does
 * not get around that check (docs/VIDFETCH-STUDY-MULTIPLATFORM-20261021.md §2), so no request is sent for it.
 * Kept out of the shared dictionaries, which are compiled into the gateway.
 */
export const YOUTUBE_NOTICE: Record<Locale, { title: string; text: string }> = {
  en: { title: "YouTube is not available on VidFetch", text: "YouTube asks hosting servers like ours to sign in before it serves a video, and VidFetch does not get around that check. Nothing was sent. Public TikTok links work." },
  fr: { title: "YouTube n'est pas disponible sur VidFetch", text: "YouTube exige une connexion de la part des serveurs d'hébergement comme le nôtre avant de fournir une vidéo, et VidFetch ne contourne pas cette vérification. Aucune demande n'a été envoyée. Les liens TikTok publics fonctionnent." },
  es: { title: "YouTube no está disponible en VidFetch", text: "YouTube pide a los servidores de alojamiento como el nuestro que inicien sesión antes de servir un vídeo, y VidFetch no elude esa comprobación. No se ha enviado nada. Los enlaces públicos de TikTok funcionan." },
  "pt-BR": { title: "O YouTube não está disponível no VidFetch", text: "O YouTube exige que servidores de hospedagem como o nosso façam login antes de entregar um vídeo, e o VidFetch não contorna essa verificação. Nada foi enviado. Links públicos do TikTok funcionam." },
  id: { title: "YouTube tidak tersedia di VidFetch", text: "YouTube meminta server hosting seperti milik kami untuk masuk sebelum menyajikan video, dan VidFetch tidak mengakali pemeriksaan itu. Tidak ada yang dikirim. Tautan TikTok publik dapat digunakan." },
  de: { title: "YouTube ist bei VidFetch nicht verfügbar", text: "YouTube verlangt von Hosting-Servern wie unserem eine Anmeldung, bevor ein Video ausgeliefert wird, und VidFetch umgeht diese Prüfung nicht. Es wurde nichts gesendet. Öffentliche TikTok-Links funktionieren." },
  it: { title: "YouTube non è disponibile su VidFetch", text: "YouTube chiede ai server di hosting come il nostro di effettuare l'accesso prima di fornire un video, e VidFetch non aggira questo controllo. Non è stato inviato nulla. I link pubblici di TikTok funzionano." },
  ar: { title: "يوتيوب غير متاح على VidFetch", text: "يطلب يوتيوب من خوادم الاستضافة مثل خوادمنا تسجيل الدخول قبل تقديم أي فيديو، ولا يتحايل VidFetch على هذا التحقق. لم يُرسَل أي طلب. روابط تيك توك العامة تعمل." },
};
