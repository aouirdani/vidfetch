/** Conservative admission bounds; these are not a promise against every browser OOM. */
export const LOCAL_LIMITS = { mobileBytes: 8 * 1024 ** 2, desktopBytes: 32 * 1024 ** 2, duration: 120, pixels: 1920 * 1080, gifSeconds: 15, gifWidth: 640, gifFps: 15, timeoutMs: 180000 } as const;
export const PRESETS = { light: 2_000_000, balanced: 1_000_000, strong: 500_000 } as const;
export type LocalToolId = "audio" | "compress" | "trim" | "gif";
