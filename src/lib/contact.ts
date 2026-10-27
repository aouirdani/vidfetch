/**
 * vidfetch.app is VidFetch's only domain, for the site and for its contact addresses.
 *
 * The shared dictionaries still name the contact addresses on vidfetch.io (legal notice, privacy and abuse
 * paragraphs). They are compiled into the download gateway, so they stay as they are until a reviewed gateway
 * release; every page shows the vidfetch.app address instead. These addresses receive mail only once Email Routing
 * is enabled on vidfetch.app (Cloudflare DNS, owner's decision).
 */
export const CONTACTS = {
  legal: "legal@vidfetch.app",
  privacy: "privacy@vidfetch.app",
  abuse: "abuse@vidfetch.app",
  support: "support@vidfetch.app",
} as const;

/** The same messages, with every contact address on the old domain moved to vidfetch.app. */
export function withOfficialContacts<T extends object>(messages: T): T {
  return Object.fromEntries(Object.entries(messages).map(([key, value]) =>
    [key, typeof value === "string" ? value.replace(/\b(legal|privacy|abuse|support)@vidfetch\.io\b/g, "$1@vidfetch.app") : value])) as T;
}
