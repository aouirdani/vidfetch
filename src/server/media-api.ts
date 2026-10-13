import { isLocalEngineHosting } from "../lib/deployment";
import * as unavailable from "./unavailable-api";

// The build alias removes local dependencies from frontend functions. These
// guards also protect direct imports and builds where the alias is not applied.
export async function healthGET() {
  if (!isLocalEngineHosting(process.env)) return unavailable.healthGET();
  const local = await import("./local-api/health");
  return local.GET();
}

export async function fetchInfoPOST(request: Request) {
  if (!isLocalEngineHosting(process.env)) return unavailable.fetchInfoPOST();
  const local = await import("./local-api/fetch-info");
  return local.POST(request);
}

export async function downloadPOST(request: Request) {
  if (!isLocalEngineHosting(process.env)) return unavailable.downloadPOST();
  const local = await import("./local-api/download");
  return local.POST(request);
}

export async function downloadGET(request: Request) {
  if (!isLocalEngineHosting(process.env)) return unavailable.downloadGET();
  const local = await import("./local-api/download");
  return local.GET(request);
}
