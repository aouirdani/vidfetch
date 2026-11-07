import { certifiedCmpSource } from "@/lib/consent";

/** Google operates the certified dialog; no home-made consent dialog or consent emulation. */
export function ConsentManager() {
  const src = certifiedCmpSource();
  return src ? <script id="google-consent-manager" src={src} async /> : null;
}
