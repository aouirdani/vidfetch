/** Local engines require an explicit opt-in; an unconfigured frontend stays usable. */
export function isLocalEngineHosting(environment: Record<string, string | undefined>): boolean {
  return environment.VIDFETCH_TARGET === "node"
    && environment.VERCEL !== "1"
    && !environment.VERCEL_ENV;
}
