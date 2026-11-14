/** Publisher-confirmed facts. Hosting and contact changes belong in this file only. */
export const PUBLISHER = {
  name: "Aymane Ouirdani",
  publicationDirector: "Aymane Ouirdani",
  country: "France",
  countryCode: "FR",
  launched: "2026-10",
  postalAddress: "",
  contacts: {
    contact: "contact@vidfetch.app",
    legal: "legal@vidfetch.app",
    privacy: "privacy@vidfetch.app",
    abuse: "abuse@vidfetch.app",
  },
  host: {
    name: "OVH SAS",
    address: "2 rue Kellermann, 59100 Roubaix, France",
    phone: "1007 (+33 9 72 10 10 07)",
  },
  distribution: "Cloudflare",
} as const;

export function hasUnfinishedFields(value: unknown): boolean {
  if (typeof value === "string") return /\[À\s+COMPLÉTER\s*:/iu.test(value);
  if (Array.isArray(value)) return value.some(hasUnfinishedFields);
  return !!value && typeof value === "object" && Object.values(value).some(hasUnfinishedFields);
}
