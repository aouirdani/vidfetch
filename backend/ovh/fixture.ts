/** Validation entry ONLY: fixed licensed fixture metadata, never deployed as the permanent entry. */
import { readFileSync } from "node:fs";
import { createBackend } from "../server";
import { engineStatus } from "../../src/lib/engine";
import { verifyUidIsolation } from "./isolation";
const profile="/etc/vidfetch/isolation.json";
verifyUidIsolation(profile);
const raw=JSON.parse(readFileSync("/opt/vidfetch/validation-3/fixture-metadata.json","utf8")) as Record<string,unknown>;
const app=createBackend({engine:{engineStatus:()=>({...engineStatus(),fixture:true,isolationProfile:verifyUidIsolation(profile)}),dumpJson:async()=>({raw,ytDlpVersion:engineStatus().ytDlp})}});
app.server.listen(8788,"127.0.0.1");
for(const signal of ["SIGTERM","SIGINT"] as const)process.once(signal,()=>void app.shutdown());
