import { build } from "esbuild";
import { access, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const output=resolve(process.argv[2]??`backend/artifacts/vidfetch-gateway-${Date.now()}.cjs`);
try { await access(output);throw new Error("Output already exists"); } catch(error) { if(error.code!=="ENOENT")throw error; }
await mkdir(dirname(output),{recursive:true});
await build({entryPoints:["backend/gateway/main.ts"],outfile:output,bundle:true,platform:"node",target:"node22",format:"cjs",logLevel:"warning"});
console.log("Gateway bundle created; no activation performed.");
