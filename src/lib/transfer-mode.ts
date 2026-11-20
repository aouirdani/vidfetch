export type TransferMode = "popup" | "direct";
export const TRANSFER_PREFERENCE = "vidfetch-transfer-mode";
export const TRANSFER_PREFERENCE_SECONDS = 7 * 24 * 60 * 60;

export function transferMode(cookie: string): TransferMode {
  return cookie.split(";").some(value => value.trim() === `${TRANSFER_PREFERENCE}=direct`) ? "direct" : "popup";
}

/** A preference only. It never authorizes a request or replaces proof/cookies. */
export function applyTransferPreference() {
  if (typeof window === "undefined" || window.location.origin !== "https://vidfetch.app" || window.location.pathname !== "/") return;
  const mode = new URLSearchParams(window.location.search).get("transfer");
  if (mode !== "direct" && mode !== "popup") return;
  document.cookie = `${TRANSFER_PREFERENCE}=${mode}; Max-Age=${TRANSFER_PREFERENCE_SECONDS}; Path=/; Secure; SameSite=Lax`;
}
export function preferredTransferMode(): TransferMode {
  return typeof document === "undefined" ? "popup" : transferMode(document.cookie);
}
