import type { Locale } from "@/i18n/config";
import type { SitePage } from "@/lib/site-pages";

/** Google AdSense publisher reference; /ads.txt declares the same publisher. The account is not approved yet. */
export const ADSENSE_CLIENT = "ca-pub-7903460199253248";
export const ADSENSE_SCRIPT = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;
/** Keep off until Google approves the publisher account. */
export const ADSENSE_DEFERRED_LOADING_ENABLED = false;
/** Loaded only after an interaction/scroll AND after the load event, if explicitly enabled. */
export const ADSENSE_DEFERRED_LOADER = `(()=>{let pageLoaded=document.readyState==="complete",intent=false,started=false;const start=()=>{if(!pageLoaded||!intent||started)return;started=true;removeEventListener("load",onLoad);for(const event of ["pointerdown","keydown","scroll","touchstart"])removeEventListener(event,onIntent);const script=document.createElement("script");script.async=true;script.src=${JSON.stringify(ADSENSE_SCRIPT)};script.crossOrigin="anonymous";document.head.appendChild(script)};const onLoad=()=>{pageLoaded=true;start()};const onIntent=()=>{intent=true;start()};if(!pageLoaded)addEventListener("load",onLoad,{once:true});for(const event of ["pointerdown","keydown","scroll","touchstart"])addEventListener(event,onIntent,{once:true,passive:true});start()})()`;

/**
 * First privacy paragraph while the AdSense publisher account is unapproved and no ads are displayed.
 * Kept out of src/i18n/messages on purpose: the download gateway bundles those dictionaries, and any change
 * there changes the gateway artifact, which the CI promoter refuses to deploy without a separate review.
 */
export const ADVERTISING_PRIVACY: Record<Locale, string> = {
  en: "VidFetch does not currently display ads. If advertising is enabled in the future, this notice will be updated to explain any related data use.",
  fr: "VidFetch n’affiche actuellement aucune publicité. Si la publicité est activée à l’avenir, cette notice sera mise à jour pour expliquer tout traitement de données associé.",
  es: "VidFetch no muestra anuncios actualmente. Si la publicidad se habilita en el futuro, actualizaremos este aviso para explicar cualquier uso de datos relacionado.",
  "pt-BR": "O VidFetch não exibe anúncios no momento. Se a publicidade for ativada no futuro, este aviso será atualizado para explicar qualquer uso de dados relacionado.",
  id: "VidFetch saat ini tidak menampilkan iklan. Jika iklan diaktifkan nanti, pemberitahuan ini akan diperbarui untuk menjelaskan penggunaan data yang terkait.",
  de: "VidFetch zeigt derzeit keine Werbung an. Sollte Werbung künftig aktiviert werden, wird dieser Hinweis aktualisiert und erklärt dann die damit verbundene Datennutzung.",
  it: "Al momento VidFetch non mostra annunci. Se la pubblicità verrà attivata in futuro, aggiorneremo questa informativa per spiegare l'eventuale uso dei dati correlato.",
  ar: "لا يعرض VidFetch إعلانات حاليًا. إذا فُعّلت الإعلانات مستقبلًا، فسنحدّث هذا الإشعار لتوضيح أي استخدام للبيانات مرتبط بها.",
};

/**
 * Pages that declare the AdSense publisher account: indexable pages with publisher content (the homes, the approved platform pages and
 * published guides). Never a 404, a noindex draft or the legal page: Google Publisher Policies exclude ads on screens
 * without publisher content, under construction, or used for navigation or alerts.
 */
export function showsAds(page: Pick<SitePage, "indexable" | "identity"> | undefined): boolean {
  return !!page?.indexable && page.identity.kind !== "legal" && page.identity.kind !== "local-tool";
}
