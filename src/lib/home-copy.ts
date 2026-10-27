import type { Locale } from "../i18n/config";

/**
 * Home page search copy, centred on TikTok: the platform validated on our hosting.
 * Kept out of src/i18n/messages on purpose: the download gateway bundles those dictionaries, and any change there
 * changes the gateway artifact, which the CI promoter refuses to deploy without a separate review.
 * es, pt-BR, id, de, it and ar wording awaits a native review.
 */
export type HomeCopy = {
  title: string; description: string; heroTitle: string; heroAccent: string; heroDescription: string;
  /** Answer to the home FAQ "Which links can I try?": TikTok verified, Instagram and X not yet, YouTube blocked. */
  platformsAnswer: string;
};

/** Last substantial change of the home pages (sitemap lastmod, WebPage dateModified). */
export const HOME_UPDATED = "2026-10-27";

export const HOME_COPY: Record<Locale, HomeCopy> = {
  en: {
    title: "TikTok Downloader – Save MP4 Video or MP3 Audio | VidFetch",
    description: "Paste the link of a public TikTok video and save it as MP4, or keep only the sound as MP3. Free, no account and no app, on your phone or computer.",
    heroTitle: "Save TikTok videos as MP4",
    heroAccent: "or keep the sound as MP3.",
    heroDescription: "Paste the link of a public TikTok video you are allowed to keep. VidFetch lists the formats TikTok provides and saves the one you choose to your phone or computer.",
    platformsAnswer: "Public TikTok videos are the links verified on our hosting, including share links from the app. Instagram and X links are recognized but not verified yet, so they may fail. YouTube is not available: it asks hosting servers like ours to sign in, and VidFetch does not get around that check.",
  },
  fr: {
    title: "Télécharger des vidéos TikTok en MP4 ou MP3 | VidFetch",
    description: "Collez le lien d'une vidéo TikTok publique et enregistrez-la en MP4, ou gardez seulement le son en MP3. Gratuit, sans compte ni appli, sur mobile ou ordinateur.",
    heroTitle: "Enregistrez vos vidéos TikTok en MP4",
    heroAccent: "ou gardez seulement le son en MP3.",
    heroDescription: "Collez le lien d'une vidéo TikTok publique que vous avez le droit de conserver. VidFetch affiche les formats fournis par TikTok et enregistre celui que vous choisissez sur votre téléphone ou votre ordinateur.",
    platformsAnswer: "Les vidéos TikTok publiques sont les liens vérifiés sur notre hébergement, y compris les liens de partage de l'application. Les liens Instagram et X sont reconnus mais pas encore vérifiés : ils peuvent échouer. YouTube n'est pas disponible : il exige une connexion de la part des serveurs d'hébergement comme le nôtre, et VidFetch ne contourne pas cette vérification.",
  },
  es: {
    title: "Descargar vídeos de TikTok en MP4 o MP3 | VidFetch",
    description: "Pega el enlace de un vídeo público de TikTok y guárdalo en MP4, o quédate solo con el sonido en MP3. Gratis, sin cuenta ni app, en el móvil o el ordenador.",
    heroTitle: "Guarda tus vídeos de TikTok en MP4",
    heroAccent: "o quédate solo con el sonido en MP3.",
    heroDescription: "Pega el enlace de un vídeo público de TikTok que tengas permiso para conservar. VidFetch muestra los formatos que ofrece TikTok y guarda el que elijas en tu móvil o tu ordenador.",
    platformsAnswer: "Los vídeos públicos de TikTok son los enlaces verificados en nuestro alojamiento, incluidos los enlaces para compartir de la app. Los enlaces de Instagram y X se reconocen, pero aún no están verificados y pueden fallar. YouTube no está disponible: pide a los servidores de alojamiento como el nuestro que inicien sesión, y VidFetch no elude esa comprobación.",
  },
  "pt-BR": {
    title: "Baixar vídeos do TikTok em MP4 ou MP3 | VidFetch",
    description: "Cole o link de um vídeo público do TikTok e salve em MP4, ou fique só com o áudio em MP3. Grátis, sem conta e sem app, no celular ou no computador.",
    heroTitle: "Salve seus vídeos do TikTok em MP4",
    heroAccent: "ou fique só com o áudio em MP3.",
    heroDescription: "Cole o link de um vídeo público do TikTok que você tem permissão para guardar. O VidFetch mostra os formatos que o TikTok oferece e salva o que você escolher no celular ou no computador.",
    platformsAnswer: "Vídeos públicos do TikTok são os links verificados na nossa hospedagem, incluindo os links de compartilhamento do app. Links do Instagram e do X são reconhecidos, mas ainda não foram verificados e podem falhar. O YouTube não está disponível: ele exige que servidores de hospedagem como o nosso façam login, e o VidFetch não contorna essa verificação.",
  },
  id: {
    title: "Download Video TikTok MP4 atau MP3 Gratis | VidFetch",
    description: "Tempel tautan video TikTok publik lalu simpan sebagai MP4, atau ambil suaranya saja sebagai MP3. Gratis, tanpa akun dan tanpa aplikasi, di ponsel atau komputer.",
    heroTitle: "Simpan video TikTok sebagai MP4",
    heroAccent: "atau ambil suaranya saja sebagai MP3.",
    heroDescription: "Tempel tautan video TikTok publik yang boleh Anda simpan. VidFetch menampilkan format yang disediakan TikTok dan menyimpan pilihan Anda ke ponsel atau komputer.",
    platformsAnswer: "Video TikTok publik adalah tautan yang sudah diverifikasi di hosting kami, termasuk tautan berbagi dari aplikasi. Tautan Instagram dan X dikenali tetapi belum diverifikasi, jadi bisa gagal. YouTube tidak tersedia: YouTube meminta server hosting seperti milik kami untuk masuk, dan VidFetch tidak mengakali pemeriksaan itu.",
  },
  de: {
    title: "TikTok-Videos als MP4 oder MP3 herunterladen | VidFetch",
    description: "Füge den Link eines öffentlichen TikTok-Videos ein und speichere es als MP4 oder nur den Ton als MP3. Kostenlos, ohne Konto und App, auf Handy oder Computer.",
    heroTitle: "Speichere TikTok-Videos als MP4",
    heroAccent: "oder behalte nur den Ton als MP3.",
    heroDescription: "Füge den Link eines öffentlichen TikTok-Videos ein, das du behalten darfst. VidFetch zeigt die Formate, die TikTok anbietet, und speichert das gewählte auf deinem Handy oder Computer.",
    platformsAnswer: "Öffentliche TikTok-Videos sind die Links, die auf unserem Hosting geprüft sind, auch Teilen-Links aus der App. Instagram- und X-Links werden erkannt, sind aber noch nicht geprüft und können fehlschlagen. YouTube ist nicht verfügbar: YouTube verlangt von Hosting-Servern wie unserem eine Anmeldung, und VidFetch umgeht diese Prüfung nicht.",
  },
  it: {
    title: "Scaricare video TikTok in MP4 o MP3 | VidFetch",
    description: "Incolla il link di un video TikTok pubblico e salvalo in MP4, oppure tieni solo l'audio in MP3. Gratis, senza account né app, su telefono o computer.",
    heroTitle: "Salva i video TikTok in MP4",
    heroAccent: "oppure tieni solo l'audio in MP3.",
    heroDescription: "Incolla il link di un video TikTok pubblico che hai il permesso di conservare. VidFetch mostra i formati offerti da TikTok e salva quello che scegli sul telefono o sul computer.",
    platformsAnswer: "I video TikTok pubblici sono i link verificati sul nostro hosting, compresi i link di condivisione dell'app. I link di Instagram e X vengono riconosciuti ma non sono ancora verificati, quindi possono non funzionare. YouTube non è disponibile: chiede ai server di hosting come il nostro di effettuare l'accesso e VidFetch non aggira questo controllo.",
  },
  ar: {
    title: "تنزيل فيديوهات تيك توك MP4 أو MP3 مجانًا | VidFetch",
    description: "الصق رابط فيديو عام على تيك توك واحفظه بصيغة MP4، أو احتفظ بالصوت فقط بصيغة MP3. مجاني، دون حساب أو تطبيق، على الهاتف أو الكمبيوتر.",
    heroTitle: "احفظ فيديوهات تيك توك بصيغة MP4",
    heroAccent: "أو احتفظ بالصوت فقط بصيغة MP3.",
    heroDescription: "الصق رابط فيديو عام على تيك توك يحق لك الاحتفاظ به. يعرض VidFetch الصيغ التي يوفّرها تيك توك ويحفظ الصيغة التي تختارها على هاتفك أو جهاز الكمبيوتر.",
    platformsAnswer: "فيديوهات تيك توك العامة هي الروابط التي جرى التحقق منها على استضافتنا، بما فيها روابط المشاركة من التطبيق. يتعرّف الموقع على روابط إنستغرام وX لكن لم يجرِ التحقق منها بعد، لذا قد تفشل. يوتيوب غير متاح: يطلب من خوادم الاستضافة مثل خوادمنا تسجيل الدخول، ولا يتحايل VidFetch على هذا التحقق.",
  },
};
