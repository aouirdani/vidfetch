import type { Messages } from "./dictionaries";

/** Only interactive labels cross the server/client boundary. Full dictionaries remain unchanged. */
export const CLIENT_MESSAGE_KEYS = ["another", "audio", "backendUnavailable", "best", "clear", "clipboardBlocked", "clipboardEmpty", "detected", "download", "downloadChannel", "downloadType", "downloading", "emptyLink", "expired", "extract", "extractedVideo", "extracting", "fetchFailed", "formatFound", "home", "invalidLink", "keepOpen", "limitError", "linkExample", "loadingVideo", "mergedAudio", "mp3Available", "networkError", "noAudio", "noFormats", "notFoundDescription", "notFoundTitle", "operationFailed", "original", "originalFormats", "paste", "placeholder", "popupBlocked", "preparing", "progress", "quality", "rateLimited", "restricted", "retry", "saved", "starting", "statusStopped", "supportedHint", "timeoutError", "transferFooter", "transferStopped", "verified", "verifyAgain", "verifyDescription", "verifyFailed", "video", "videoLink", "views", "waiting", "waitingCancelled", "yourFile"] as const satisfies readonly (keyof Messages)[];
export type ClientMessages = Pick<Messages, typeof CLIENT_MESSAGE_KEYS[number]>;
export function clientMessages(messages: Messages): ClientMessages {
  return Object.fromEntries(CLIENT_MESSAGE_KEYS.map(key => [key, messages[key]])) as ClientMessages;
}
