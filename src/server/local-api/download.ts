import { EngineError, isEngineError } from "@/lib/engine";
import { getTransferStatus, parseDownloadInput, prepareDownload, takeDownload } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(error: unknown): Response {
  const issue = isEngineError(error) ? error : new EngineError("ENGINE_ERROR", "The download could not be prepared. Please try again.", 500);
  console.error("[vidfetch] download", issue.code, issue.detail ?? issue.message);
  return Response.json({ ok: false, code: issue.code, error: issue.message }, {
    status: issue.status, headers: { "Cache-Control": "no-store", ...(issue.status === 429 ? { "Retry-After": "30" } : {}) },
  });
}

/** Prepare a real stream before telling the UI it is ready. Tickets are short-lived and single-use. */
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 8192) throw new EngineError("INVALID_URL", "The download request is too large.", 400);
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { throw new EngineError("INVALID_URL", "Send a valid JSON download request.", 400); }
    const ready = await prepareDownload(parseDownloadInput(payload));
    return Response.json({ ok: true, ...ready }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

/** Supports both browser tickets and the original ?url=&format_id=&type= API contract. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("status")) {
      const status = getTransferStatus(params.get("status") ?? "");
      if (!status) throw new EngineError("EXPIRED", "This transfer status has expired.", 404);
      return Response.json({ ok: true, ...status }, { headers: { "Cache-Control": "no-store" } });
    }
    let token = params.get("ticket");
    if (!token) {
      const input = parseDownloadInput({ url: params.get("url"), format_id: params.get("format_id") ?? params.get("formatId"), type: params.get("type") ?? "video" });
      token = (await prepareDownload(input)).token;
    }
    return takeDownload(token, request.signal);
  } catch (error) { return failure(error); }
}
