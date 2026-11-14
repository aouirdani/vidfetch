import type { Locale } from "@/i18n/config";
import { PUBLISHER } from "@/lib/publisher";
import { PUBLISHER_LABELS } from "@/lib/publisher-labels";
import { ContactText } from "./AbuseLink";

export function PublisherNotice({ locale }: { locale: Locale }) {
  const labels = PUBLISHER_LABELS[locale];
  return <div className="mt-10 space-y-8">
    <section><h2 className="text-xl font-semibold">{labels.publisher}</h2>
      <p className="mt-4 text-slate-300">{PUBLISHER.name} · {labels.status} · {new Intl.DisplayNames([locale], { type: "region" }).of(PUBLISHER.countryCode)}</p>
      <p className="mt-3 text-slate-300">{labels.director} : {PUBLISHER.publicationDirector}</p>
      <p className="mt-3 text-slate-300"><ContactText text={`${labels.email} : ${PUBLISHER.contacts.legal}`} /></p>
      {PUBLISHER.postalAddress && <p className="mt-3 text-slate-300">{labels.address} : {PUBLISHER.postalAddress}</p>}
    </section>
    <section><h2 className="text-xl font-semibold">{labels.host}</h2>
      <p className="mt-4 text-slate-300">{PUBLISHER.host.name}</p>
      <p className="mt-3 text-slate-300">{PUBLISHER.host.address}</p>
      <p className="mt-3 text-slate-300">{labels.phone} : <bdi>{PUBLISHER.host.phone}</bdi></p>
      <p className="mt-3 text-slate-300">{labels.distribution} : {PUBLISHER.distribution}</p>
    </section>
  </div>;
}
