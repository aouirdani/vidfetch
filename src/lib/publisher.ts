/** Values must be supplied by the publisher; missing facts prevent the affected pages from publishing. */
export const PUBLISHER = {
  name: "[À COMPLÉTER : nom public de l’éditeur ou entité]",
  country: "[À COMPLÉTER : pays de l’éditeur]",
  jurisdiction: "[À COMPLÉTER : droit applicable]",
  launched: "[À COMPLÉTER : date de lancement]",
  author: "[À COMPLÉTER : auteur]",
  review: "[À COMPLÉTER : existence et identité d’une relecture humaine]",
  responseTime: "[À COMPLÉTER : délai de réponse réaliste]",
  copyrightTime: "[À COMPLÉTER : délai de traitement des signalements]",
  infrastructureRetention: "[À COMPLÉTER : durée de conservation vérifiée des journaux d’infrastructure]",
} as const;

export function hasUnfinishedFields(value: unknown): boolean {
  if (typeof value === "string") return /\[À\s+COMPLÉTER\s*:/iu.test(value);
  if (Array.isArray(value)) return value.some(hasUnfinishedFields);
  return !!value && typeof value === "object" && Object.values(value).some(hasUnfinishedFields);
}
