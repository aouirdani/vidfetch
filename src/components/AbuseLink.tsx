import { CONTACTS } from "@/lib/contact";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Cloudflare's documented per-address opt-out keeps this SSR mailto usable without JavaScript. */
export function AbuseLink({ label }: { label: string }) {
  return <span dangerouslySetInnerHTML={{ __html: `<!--email_off--><a href="mailto:${CONTACTS.abuse}">${escapeHtml(label)}</a><!--/email_off-->` }} />;
}

/** Cloudflare also turns plain-text addresses into links, including legal/privacy contact paragraphs. */
export function ContactText({ text }: { text: string }) {
  if (!text.includes("@vidfetch.app")) return text;
  return <span dangerouslySetInnerHTML={{ __html: `<!--email_off-->${escapeHtml(text)}<!--/email_off-->` }} />;
}
