import { readFileSync, statSync } from "node:fs";

export function verifyIsolationProfile(file: string) {
  if (process.platform !== "linux" || !file.startsWith("/")) throw new Error("Isolated worker requires Linux and a root-owned profile");
  const metadata = statSync(file);
  if (!metadata.isFile() || metadata.uid !== 0 || (metadata.mode & 0o022)) throw new Error("Isolation profile must be controlled by root");
  const profile = JSON.parse(readFileSync(file,"utf8")) as { version?: string; backendUid?: number; proxyUid?: number; namespaceInode?: number; rulesVerified?: boolean };
  const status = readFileSync("/proc/self/status","utf8");
  if (profile.version !== "vidfetch-netns-v1" || profile.rulesVerified !== true || !profile.backendUid || !profile.proxyUid || profile.proxyUid === profile.backendUid
    || profile.backendUid !== process.getuid?.() || profile.namespaceInode !== statSync("/proc/self/ns/net").ino
    || !/^CapEff:\s+0+$/m.test(status) || !/^NoNewPrivs:\s+1$/m.test(status)) throw new Error("Isolation requirements are not satisfied");
  for (const variable of Object.keys(process.env)) if (/^YTDLP_.*(?:COOKIES|PROXY)/.test(variable) && process.env[variable]) throw new Error("Public worker cannot inherit cookie/proxy secrets");
  return "vidfetch-netns-v1";
}
