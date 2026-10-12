import { build } from "esbuild";
import { access, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
const output=resolve(process.argv[2]??`backend/artifacts/vidfetch-public-worker-${Date.now()}.cjs`);
try{await access(output);throw Error("Output already exists");}catch(error){if(error.code!=="ENOENT")throw error;}
await mkdir(dirname(output),{recursive:true});
await build({entryPoints:["backend/public-worker/main.ts"],outfile:output,bundle:true,platform:"node",target:"node22",format:"cjs",alias:{"ffmpeg-static":"./backend/ffmpeg-static-shim.cjs"},logLevel:"warning"});
console.log("Isolated worker bundle prepared; existing Pi bundle untouched.");
