import type { Messages } from "./dictionaries";
import type { Locale } from "./config";
import { restrictedPostMessage, popupBlockedMessage } from "./video-errors";
/** Translate presentation only; API codes, enums and response shapes stay stable. */
export function errorMessage(code: string | undefined, messages: Pick<Messages, "backendUnavailable" | "expired" | "invalidLink" | "limitError" | "noFormats" | "operationFailed" | "rateLimited" | "restricted" | "timeoutError">, locale: Locale = "en"): string {
  if (code === "POPUP_BLOCKED") return popupBlockedMessage[locale];
  if (code === "POST_ACCESS_RESTRICTED") return restrictedPostMessage[locale];
  if (/FORMAT|NO_STREAM/.test(code ?? "")) return messages.noFormats;
  if (/UNAVAILABLE|ENGINE_MISSING|MAINTENANCE/.test(code ?? "")) return messages.backendUnavailable;
  if (/RATE|QUOTA|QUEUE_FULL|BUSY|CONCURRENT/.test(code ?? "")) return messages.rateLimited;
  if (/AUTH|PRIVATE|FORBIDDEN|RESTRICT|CHALLENGE/.test(code ?? "")) return messages.restricted;
  if (/EXPIRED|TICKET|INVALID_ACCESS/.test(code ?? "")) return messages.expired;
  if (/SIZE|LARGE|DURATION|LIMIT/.test(code ?? "")) return messages.limitError;
  if (/TIMEOUT/.test(code ?? "")) return messages.timeoutError;
  if (/URL|PLATFORM|INPUT/.test(code ?? "")) return messages.invalidLink;
  return messages.operationFailed;
}
