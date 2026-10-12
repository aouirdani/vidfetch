import type { Messages } from "./dictionaries";
/** Translate presentation only; API codes, enums and response shapes stay stable. */
export function errorMessage(code: string | undefined, messages: Messages): string {
  if (code === "POPUP_BLOCKED") return messages.popupBlocked;
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
