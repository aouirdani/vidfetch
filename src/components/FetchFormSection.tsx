import { FetchFormIsland } from "./FetchFormIsland";
import { I18nProvider } from "@/i18n/context";
import { dictionary } from "@/i18n/dictionaries";
import { clientMessages } from "@/i18n/client-messages";
import { withOfficialContacts } from "@/lib/contact";
import { ADVERTISING_PRIVACY } from "@/lib/adsense";
import type { Locale } from "@/i18n/config";
import type { Platform } from "@/lib/platforms";

// Only the downloader and its results consume this context. Static pages and the
// surrounding navigation do not need a client provider or its serialized labels.
export function FetchFormSection({ locale, ...props }: { locale: Locale; compact?: boolean; platform?: Platform }) {
  const d = dictionary(locale);
  return <I18nProvider locale={locale} messages={clientMessages({ ...withOfficialContacts(d), privacy1: ADVERTISING_PRIVACY[locale] })}><FetchFormIsland {...props} /></I18nProvider>;
}
