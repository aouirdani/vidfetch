import type { MediaFormat } from "../lib/media";
import type { Messages } from "./dictionaries";
/** Keep source dimensions and IDs unchanged; portrait quality uses the shorter side. */
export function localizedFormatLabel(format: MediaFormat, messages: Messages) {
  if (format.kind === "audio") return `${format.ext.toUpperCase()}${format.bitrateKbps ? ` · ${Math.round(format.bitrateKbps)} kbps` : ` · ${messages.audio}`}`;
  const resolution = format.height && format.width ? Math.min(format.height, format.width) : format.height;
  return `${resolution ? `${resolution}p` : messages.originalFormats}${format.fps && format.fps > 30 ? ` · ${Math.round(format.fps)} fps` : ""}`;
}
