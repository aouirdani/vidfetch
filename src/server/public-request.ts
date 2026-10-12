import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { AccessError } from "./access-crypto";

function publicIp(ip: string) {
  if (isIP(ip) === 4) {
    const [a,b,c] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  const [a,b] = ip.toLowerCase().split(":");
  return isIP(ip) === 6 && /^[23][0-9a-f]{3}:/i.test(ip) && !(a === "2001" && (parseInt(b || "0",16) < 0x200 || b === "db8")) && !["2002","3ffe","3fff"].includes(a);
}
/** Fixed HTTPS control endpoint, DNS addresses pinned, no redirects, small JSON. */
export async function publicJsonPost(url: URL, body: string, headers: Record<string,string>): Promise<Record<string,unknown>> {
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new AccessError("BACKEND_UNAVAILABLE",503)),3000); });
  let records;
  try { records = await Promise.race([lookup(url.hostname.replace(/^\[|\]$/g,""), { all: true }),deadline]); }
  finally { clearTimeout(dnsTimer); }
  if (!records.length || records.some(r => !publicIp(r.address))) throw new AccessError("BACKEND_UNAVAILABLE",503);
  return new Promise((resolve,reject) => {
    const req = request(url, { method: "POST", agent: false, family:records[0].family, lookup: (_host,_options,callback) => callback(null, records[0].address, records[0].family),
      headers: { ...headers, "Content-Type":"application/json", "Content-Length":Buffer.byteLength(body) } }, res => {
      const chunks: Buffer[] = []; let size=0;
      res.on("data", (chunk:Buffer) => { size+=chunk.length; if(size>16384) req.destroy(new AccessError("BACKEND_UNAVAILABLE",503)); else chunks.push(chunk); });
      res.on("error", reject);
      res.on("end",()=> { if(res.statusCode!==200) { reject(new AccessError(res.statusCode===429?"RATE_LIMITED":"BACKEND_UNAVAILABLE",res.statusCode===429?429:503));return; }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(new AccessError("BACKEND_UNAVAILABLE",503)); } });
    });
    const timer=setTimeout(()=>req.destroy(new AccessError("BACKEND_UNAVAILABLE",503)),8000);
    req.on("close",()=>clearTimeout(timer));req.on("error",reject);req.end(body);
  });
}
