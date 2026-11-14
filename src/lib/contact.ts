/** Official contact addresses; shared gateway dictionaries retain their existing bytes. */
import { PUBLISHER } from "./publisher";
export const CONTACTS = PUBLISHER.contacts;

/** The same messages, with every contact address on the old domain moved to vidfetch.app. */
export function withOfficialContacts<T extends object>(messages: T): T {
  return Object.fromEntries(Object.entries(messages).map(([key, value]) =>
    [key, typeof value === "string" ? value.replace(/\b(legal|privacy|abuse|support)@vidfetch\.io\b/g, "$1@vidfetch.app") : value])) as T;
}
