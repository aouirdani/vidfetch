import type { Locale } from "@/i18n/config";
import type { SitePage } from "@/lib/site-pages";

/** Google AdSense publisher. The site layout loads the tag; /ads.txt declares the same publisher. */
export const ADSENSE_CLIENT = "ca-pub-7903460199253248";
export const ADSENSE_SCRIPT = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

/**
 * First privacy paragraph now that the site shows Google ads (AdSense requires this disclosure).
 * Kept out of src/i18n/messages on purpose: the download gateway bundles those dictionaries, and any change
 * there changes the gateway artifact, which the CI promoter refuses to deploy without a separate review.
 */
export const ADVERTISING_PRIVACY: Record<Locale, string> = {
  en: "No VidFetch account is required. The site shows ads served by Google AdSense. Google and its partners may use cookies to serve ads based on your visits to this and other websites. You can manage personalized advertising in Google’s Ads Settings (adssettings.google.com).",
  fr: "Aucun compte VidFetch n’est requis. Le site affiche des annonces diffusées par Google AdSense. Google et ses partenaires peuvent utiliser des cookies pour diffuser des annonces en fonction de vos visites sur ce site et sur d’autres sites. Vous pouvez gérer la publicité personnalisée dans les paramètres des annonces de Google (adssettings.google.com).",
  es: "No se requiere cuenta de VidFetch. El sitio muestra anuncios servidos por Google AdSense. Google y sus socios pueden usar cookies para mostrar anuncios basados en tus visitas a este y otros sitios web. Puedes gestionar la publicidad personalizada en la Configuración de anuncios de Google (adssettings.google.com).",
  "pt-BR": "Não é necessário ter conta no VidFetch. O site exibe anúncios veiculados pelo Google AdSense. O Google e seus parceiros podem usar cookies para exibir anúncios com base nas suas visitas a este e a outros sites. Você pode gerenciar a publicidade personalizada nas Configurações de anúncios do Google (adssettings.google.com).",
  id: "Tidak perlu akun VidFetch. Situs ini menampilkan iklan yang disajikan oleh Google AdSense. Google dan mitranya dapat menggunakan kuki untuk menayangkan iklan berdasarkan kunjungan Anda ke situs ini dan situs lain. Anda dapat mengelola iklan yang dipersonalisasi di Setelan Iklan Google (adssettings.google.com).",
  de: "Ein VidFetch-Konto ist nicht erforderlich. Die Website zeigt Anzeigen, die von Google AdSense ausgeliefert werden. Google und seine Partner können Cookies verwenden, um Anzeigen auf Grundlage deiner Besuche auf dieser und anderen Websites auszuliefern. Personalisierte Werbung kannst du in den Google-Anzeigeneinstellungen (adssettings.google.com) verwalten.",
  it: "Non serve un account VidFetch. Il sito mostra annunci forniti da Google AdSense. Google e i suoi partner possono usare cookie per mostrare annunci basati sulle tue visite a questo e ad altri siti. Puoi gestire la pubblicità personalizzata nelle Impostazioni annunci di Google (adssettings.google.com).",
  ar: "لا يلزم حساب VidFetch. يعرض الموقع إعلانات تقدّمها Google AdSense. قد تستخدم Google وشركاؤها ملفات تعريف الارتباط لعرض إعلانات استنادًا إلى زياراتك لهذا الموقع ولمواقع أخرى. يمكنك إدارة الإعلانات المخصّصة من إعدادات الإعلانات في Google (adssettings.google.com).",
};

/**
 * Pages that load the AdSense tag: indexable pages with publisher content (the homes, the approved platform pages and
 * published guides). Never a 404, a noindex draft or the legal page: Google Publisher Policies exclude ads on screens
 * without publisher content, under construction, or used for navigation or alerts.
 */
export function showsAds(page: Pick<SitePage, "indexable" | "identity"> | undefined): boolean {
  return !!page?.indexable && page.identity.kind !== "legal";
}
