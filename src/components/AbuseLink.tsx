import { CONTACTS } from "@/lib/contact";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Cloudflare's documented per-address opt-out keeps this SSR mailto usable without JavaScript. */
export function AbuseLink({ label }: { label: string }) {
  return <span dangerouslySetInnerHTML={{ __html: `<!--email_off--><a href="mailto:${CONTACTS.abuse}">${escapeHtml(label)}</a><!--/email_off-->` }} />;
}
