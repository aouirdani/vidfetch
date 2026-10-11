import { db } from "@/db";
import { fetches } from "@/db/schema";
import { EngineError, dumpJson, engineStatus, isEngineError } from "@/lib/engine";
import { toMediaInfo } from "@/lib/extract";
import { detectPlatform, type Platform } from "@/lib/platforms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let url = "", platform: Platform | null = null;
  try {
    const body = await request.text();
    if (body.length > 8192) throw new EngineError("INVALID_URL", "The video link is too long.", 400);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new EngineError("INVALID_URL", "Send a valid JSON object containing the video URL.", 400); }
    const input = payload && typeof payload === "object" ? (payload as { url?: unknown }).url : "";
    const detection = detectPlatform(typeof input === "string" ? input : "");
    if (!detection.ok || !detection.platform) throw new EngineError("INVALID_URL", "Paste a public YouTube, TikTok, Instagram or X video link. Profiles and photo-only posts are not supported.", 400);
    url = detection.url; platform = detection.platform;
    const { raw, ytDlpVersion } = await dumpJson(url);
    const engine = engineStatus();
    const info = toMediaInfo({ raw, platform, url, ffmpeg: engine.ffmpeg });
    try {
      await db.insert(fetches).values({
        url, platform, platformVideoId: info.platformVideoId, title: info.title, thumbnail: info.thumbnail,
        durationSeconds: info.duration != null ? Math.round(info.duration) : null,
        formatCount: info.formats.length, engine: ytDlpVersion, status: "success",
      });
    } catch (error) { console.error("[vidfetch] metadata log unavailable", error); }
    return Response.json({ ok: true, info, engine }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const issue = isEngineError(error) ? error : new EngineError("ENGINE_ERROR", "This video could not be extracted. Please try another public link.", 502);
    if (platform) {
      try { await db.insert(fetches).values({ url, platform, status: "error", errorMessage: `${issue.code}: ${issue.message}`.slice(0, 500) }); }
      catch (dbError) { console.error("[vidfetch] metadata error log unavailable", dbError); }
    }
    console.error("[vidfetch] extraction", issue.code, issue.detail ?? issue.message);
    return Response.json({ ok: false, code: issue.code, error: issue.message }, {
      status: issue.status, headers: { "Cache-Control": "no-store", ...(issue.status === 429 ? { "Retry-After": "60" } : {}) },
    });
  }
}
