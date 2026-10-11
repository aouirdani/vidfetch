// Local Node hosting retains its existing handlers. Next config substitutes the
// unavailable module on Vercel, without importing these engines or database.
export { GET as healthGET } from "./local-api/health";
export { POST as fetchInfoPOST } from "./local-api/fetch-info";
export { GET as downloadGET, POST as downloadPOST } from "./local-api/download";
